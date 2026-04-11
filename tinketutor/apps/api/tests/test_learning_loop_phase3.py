from __future__ import annotations

import io
import json
import time
import zipfile

from app.domain.enums import CitationOutputType, Difficulty, QuestionType
from app.domain.models import Chunk, ChunkMetadata, ChunkPosition, Citation, LLMResponse, QuizAttempt, QuizItem
from app.infra.store import new_id, utc_now
from app.repositories import knowledge_retrieval_repository, quiz_repository, source_ingestion_repository


def _make_minimal_docx(text_blocks: list[str]) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"
        for text in text_blocks
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def _create_notebook(client, auth_headers, *, title: str = "Cell Biology") -> str:
    response = client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": title, "description": "Phase 3 learning-loop test notebook"},
    )
    assert response.status_code == 201
    return response.json()["notebook"]["id"]


def _wait_for_job(client, auth_headers, job_id: str) -> dict:
    for _ in range(60):
        response = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
        assert response.status_code == 200
        job = response.json()["job"]
        if job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for job {job_id}")


def _upload_ready_source(client, auth_headers, notebook_id: str) -> str:
    docx_bytes = _make_minimal_docx(
        [
            "Cellular respiration converts glucose into ATP inside the mitochondria.",
            "Glycolysis occurs in the cytoplasm and produces pyruvate.",
            "The Krebs cycle generates electron carriers for oxidative phosphorylation.",
            "Oxidative phosphorylation uses the electron transport chain to produce most ATP.",
        ]
    )

    response = client.post(
        "/api/v1/sources",
        headers=auth_headers,
        data={"title": "Respiration Primer", "notebookId": notebook_id},
        files={
            "file": (
                "respiration.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 202
    payload = response.json()
    source_id = payload["source"]["id"]
    job = _wait_for_job(client, auth_headers, payload["jobId"])
    assert job["status"] == "completed"
    return source_id


class FakeQuizLLM:
    def __init__(self) -> None:
        self.prompts: list[str] = []
        self.context_chunk_ids: list[list[str]] = []

    async def generate(self, prompt, context, config):  # noqa: ANN001
        self.prompts.append(prompt)
        self.context_chunk_ids.append([chunk.chunk_id for chunk in context])
        citation_targets = [chunk.chunk_id for chunk in context[:2]]
        payload = {
            "items": [
                {
                    "question_type": "mcq",
                    "question": "What best describes glycolysis?",
                    "options": [
                        "It occurs in the cytoplasm and produces pyruvate.",
                        "It happens inside the mitochondria and consumes ATP only.",
                    ],
                    "correct_answer": "It occurs in the cytoplasm and produces pyruvate.",
                    "explanation": "Glycolysis occurs in the cytoplasm and generates pyruvate before later respiration stages.",
                    "citation_ids": citation_targets[:1],
                    "difficulty": "recall",
                    "bloom_level": 1,
                },
                {
                    "question_type": "open_ended",
                    "question": "Why does glycolysis matter for cellular respiration?",
                    "correct_answer": "It produces pyruvate that feeds later ATP-generating stages.",
                    "explanation": "Glycolysis prepares pyruvate for later respiration steps.",
                    "citation_ids": citation_targets[:1],
                    "difficulty": "understanding",
                    "bloom_level": 2,
                },
            ]
        }
        return LLMResponse(content=json.dumps(payload), model="fake-quiz-llm")

    async def stream_generate(self, prompt, context, config):  # noqa: ANN001
        if False:
            yield prompt
        return

    async def embed(self, texts):  # noqa: ANN001
        return [[0.0, 0.0, 0.0] for _ in texts]


def test_focused_quiz_generation_creates_topic_scoped_batch(client, auth_headers, monkeypatch):
    notebook_id = _create_notebook(client, auth_headers, title="Focused Quiz")
    _upload_ready_source(client, auth_headers, notebook_id)

    fake_llm = FakeQuizLLM()
    monkeypatch.setattr("app.services.quiz_service.get_llm_provider", lambda role="structured": fake_llm)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/quizzes/generate",
        headers=auth_headers,
        json={
            "topic": "glycolysis",
            "count": 2,
            "sourceIds": [],
        },
    )
    assert response.status_code == 200

    job = _wait_for_job(client, auth_headers, response.json()["jobId"])
    assert job["status"] == "completed"
    assert job["result"]["topic"] == "glycolysis"
    assert fake_llm.prompts
    assert "Focus every question on the topic: glycolysis." in fake_llm.prompts[0]
    assert fake_llm.context_chunk_ids

    list_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/quizzes",
        headers=auth_headers,
    )
    assert list_response.status_code == 200
    items = list_response.json()["quizItems"]
    batch_items = [item for item in items if item["batch_id"] == job["id"]]

    assert len(batch_items) == 2
    assert all(item["topic"] == "glycolysis" for item in batch_items)
    assert all(item["citation_ids"] for item in batch_items)
    assert all(item["source_ids"] for item in batch_items)


def test_gap_analysis_returns_topic_level_gaps_from_required_signals(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Gap Signals")
    source_id = _upload_ready_source(client, auth_headers, notebook_id)

    concept_map_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/concept-maps",
        headers=auth_headers,
        json={},
    )
    assert concept_map_response.status_code == 201
    concept_map_payload = concept_map_response.json()
    skeleton_node = next(node for node in concept_map_payload["nodes"] if node["status"] == "skeleton")

    existing_chunks = source_ingestion_repository.list_chunks(source_id)
    source = source_ingestion_repository.get_source(source_id)
    assert source is not None
    extra_chunk = Chunk(
        id=new_id(),
        notebook_id=notebook_id,
        source_id=source_id,
        user_id=source.user_id,
        order_index=max(chunk.order_index for chunk in existing_chunks) + 1,
        content=f"{skeleton_node['label']} is revisited in an untouched study section that the student has not interacted with yet.",
        token_count=18,
        position=ChunkPosition(
            page_start=9,
            page_end=9,
            section_title=skeleton_node["label"],
            paragraph_index=0,
            char_start=0,
            char_end=120,
        ),
        metadata=ChunkMetadata(),
        created_at=utc_now(),
    )
    source_ingestion_repository.replace_chunks(source_id, existing_chunks + [extra_chunk])

    base_citation = knowledge_retrieval_repository.get_citation(skeleton_node["citation_ids"][0])
    assert base_citation is not None

    quiz_item_id = new_id()
    quiz_citation = Citation(
        id=new_id(),
        notebook_id=notebook_id,
        output_type=CitationOutputType.QUIZ_ITEM,
        output_id=quiz_item_id,
        chunk_id=base_citation.chunk_id,
        source_id=base_citation.source_id,
        source_title=base_citation.source_title,
        page_start=base_citation.page_start,
        page_end=base_citation.page_end,
        section_title=base_citation.section_title,
        created_at=utc_now(),
    )
    knowledge_retrieval_repository.create_citation(quiz_citation)

    quiz_item = QuizItem(
        id=quiz_item_id,
        notebook_id=notebook_id,
        batch_id="seed-batch",
        topic=skeleton_node["label"],
        source_ids=[source_id],
        question_type=QuestionType.MCQ,
        question=f"What best explains {skeleton_node['label']}?",
        options=["Wrong answer", "Another wrong answer"],
        correct_answer="Correct answer",
        explanation="Grounded explanation for the concept.",
        citation_ids=[quiz_citation.id],
        difficulty=Difficulty.RECALL,
        bloom_level=1,
        created_at=utc_now(),
    )
    quiz_repository.create_quiz_item(quiz_item)

    quiz_repository.create_quiz_attempt(
        QuizAttempt(
            id=new_id(),
            notebook_id=notebook_id,
            user_id="test-user",
            quiz_item_id=quiz_item.id,
            user_answer="Wrong answer",
            is_correct=False,
            created_at=utc_now(),
        )
    )

    analyze_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/gaps/analyze",
        headers=auth_headers,
    )
    assert analyze_response.status_code == 200

    job = _wait_for_job(client, auth_headers, analyze_response.json()["jobId"])
    assert job["status"] == "completed"

    gaps_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/gaps",
        headers=auth_headers,
    )
    assert gaps_response.status_code == 200
    payload = gaps_response.json()

    assert payload["report"] is not None
    assert payload["report"]["diagnostics"]["skeleton_node_count"] >= 1
    assert payload["report"]["diagnostics"]["incorrect_quiz_attempt_count"] == 1
    assert payload["report"]["diagnostics"]["zero_interaction_chunk_count"] >= 1
    assert payload["findings"]

    finding = next(
        item
        for item in payload["findings"]
        if item["topic"].casefold() == skeleton_node["label"].casefold()
    )

    assert {"topic", "description", "confidence", "evidence", "source_ids"} <= set(finding.keys())
    assert finding["description"]
    assert finding["confidence"] > 0
    assert source_id in finding["source_ids"]
    assert skeleton_node["id"] in finding["linked_node_ids"]

    evidence_types = {evidence["type"] for evidence in finding["evidence"]}
    assert {"canvas_empty", "quiz_failure", "low_coverage"} <= evidence_types
