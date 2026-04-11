"""
Quiz Service

Orchestrates quiz generation and answer submission.
Adheres to ActiveLearning context rules, pulling evidence from SynthesisWorkspace (concept map).
"""

from __future__ import annotations

import json
from collections import defaultdict
import re

from app.domain.enums import (
    JobStatus, JobType, EvidenceSupport, QuestionType, CitationOutputType
)
from app.domain.models import (
    ProcessingJob, QuizItem, QuizAttempt, Citation, EvidenceChunk, GenerationConfig
)
from app.infra.store import new_id, utc_now
from app.infra.tasks import dispatch_quiz_generation
from app.prompts.quiz_prompts import QUIZ_SYSTEM_PROMPT, OPEN_ENDED_EVALUATION_PROMPT
from app.providers.factory import get_embedding_provider, get_llm_provider, get_reranker, get_vector_store
from app.repositories import (
    concept_map_repository,
    knowledge_retrieval_repository,
    quiz_repository,
    source_ingestion_repository,
)
from app.services import notebook_service, search_service


WORD_RE = re.compile(r"\w+", flags=re.UNICODE)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _token_overlap_score(left: str, right: str) -> float:
    left_tokens = set(WORD_RE.findall(_normalize_text(left)))
    right_tokens = set(WORD_RE.findall(_normalize_text(right)))
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _infer_item_topic(item_data: dict, topic: str | None) -> str | None:
    if topic:
        return topic

    question = str(item_data.get("question", "")).strip()
    if not question:
        return None
    return question.rstrip(" ?!.")


def _build_fallback_evidence_chunk(chunk, source_title: str) -> EvidenceChunk:
    return EvidenceChunk(
        chunk_id=chunk.id,
        source_id=chunk.source_id,
        source_title=source_title,
        content=chunk.content,
        snippet_text=chunk.content,
        page_start=chunk.position.page_start,
        page_end=chunk.position.page_end,
        section_title=chunk.position.section_title,
        citation_anchor_ids=[],
        citation_ids=[],
        score=0.0,
        rank=1,
        support=EvidenceSupport.WEAK,
        keyword_score=0.0,
        vector_score=0.0,
    )


async def _collect_topic_evidence(
    *,
    notebook_id: str,
    user_id: str,
    topic: str,
    source_ids: list[str],
) -> dict[str, EvidenceChunk]:
    evidence_pack = await search_service.build_evidence_pack(
        notebook_id=notebook_id,
        user_id=user_id,
        query=topic,
        requested_source_ids=source_ids,
        top_k=8,
        vector_store=get_vector_store(),
        embedding_provider=get_embedding_provider(),
        reranker=get_reranker(),
    )
    return {
        chunk.chunk_id: chunk
        for chunk in evidence_pack.chunks
    }


def _collect_default_evidence(source_ids: list[str], notebook_id: str) -> dict[str, EvidenceChunk]:
    # 1. Prefer concept-map grounded evidence so quiz items stay tied to current study artefacts.
    evidence_chunks: dict[str, EvidenceChunk] = {}
    concept_map = concept_map_repository.get_latest_map_for_notebook(notebook_id)
    chunks_per_source = defaultdict(int)
    max_chunks_per_source = 10

    if concept_map:
        nodes = concept_map_repository.list_nodes_for_map(concept_map.id)
        edges = concept_map_repository.list_edges_for_map(concept_map.id)
        elements = nodes + edges
        supported_elements = [
            element
            for element in elements
            if element.support in [EvidenceSupport.STRONG, EvidenceSupport.PARTIAL]
        ]

        for element in supported_elements:
            for evidence_item in element.evidence_items:
                if evidence_item.source_id not in source_ids:
                    continue
                if evidence_item.chunk_id in evidence_chunks:
                    continue
                if chunks_per_source[evidence_item.source_id] >= max_chunks_per_source:
                    continue
                evidence_chunks[evidence_item.chunk_id] = EvidenceChunk(
                    chunk_id=evidence_item.chunk_id,
                    source_id=evidence_item.source_id,
                    source_title=evidence_item.source_title,
                    content=evidence_item.snippet_text,
                    snippet_text=evidence_item.snippet_text,
                    page_start=evidence_item.page_start,
                    page_end=evidence_item.page_end,
                    section_title=evidence_item.section_title,
                    citation_anchor_ids=evidence_item.citation_anchor_ids,
                    citation_ids=evidence_item.citation_ids,
                    score=evidence_item.score,
                    rank=evidence_item.rank,
                    support=evidence_item.support,
                    keyword_score=evidence_item.score,
                    vector_score=0.0,
                )
                chunks_per_source[evidence_item.source_id] += 1

    # 2. Fall back to raw chunks if the map has not produced enough usable evidence yet.
    if not evidence_chunks:
        for source_id in source_ids:
            source = knowledge_retrieval_repository.get_source(source_id)
            raw_chunks = source_ingestion_repository.list_chunks(source_id)
            for chunk in raw_chunks[:max_chunks_per_source]:
                evidence_chunks[chunk.id] = _build_fallback_evidence_chunk(
                    chunk,
                    source.title if source else "Source",
                )

    return evidence_chunks


def create_quiz_generation_job(
    user_id: str,
    notebook_id: str,
    source_ids: list[str],
    count: int = 5,
    difficulty: str | None = None,
    topic: str | None = None,
) -> ProcessingJob:
    """Creates the async job and dispatches the worker."""
    now = utc_now()
    job_id = new_id()
    
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        notebook_id=notebook_id,
        source_id=None,
        type=JobType.QUIZ_GENERATION,
        status=JobStatus.QUEUED,
        target_id=notebook_id,
        stage="queued",
        progress=0,
        result={
            "source_ids": source_ids,
            "count": count,
            "difficulty": difficulty,
            "topic": topic,
            "batch_id": job_id,
        },
        error_message=None,
        created_at=now,
        updated_at=now,
    )
    
    source_ingestion_repository.create_job(job)
    dispatch_quiz_generation(notebook_id, job_id, source_ids, count, difficulty, topic)
    return job


async def _process_quiz_generation(
    notebook_id: str,
    job_id: str,
    source_ids: list[str],
    count: int,
    difficulty: str | None,
    topic: str | None = None,
) -> None:
    job = source_ingestion_repository.get_job(job_id)
    if not job:
        return

    job.status = JobStatus.RUNNING
    job.stage = "fetching_evidence"
    job.started_at = utc_now()
    job.updated_at = utc_now()
    source_ingestion_repository.update_job(job)

    try:
        notebook = notebook_service.get_notebook(notebook_id, job.user_id)
        requested_source_ids = source_ids or (notebook.get("source_ids", []) if notebook else [])

        if topic:
            evidence_chunks = await _collect_topic_evidence(
                notebook_id=notebook_id,
                user_id=job.user_id,
                topic=topic,
                source_ids=requested_source_ids,
            )
        else:
            evidence_chunks = _collect_default_evidence(requested_source_ids, notebook_id)

        if not evidence_chunks:
            raise ValueError(
                f"No notebook-scoped evidence was found for quiz generation{f' on topic {topic!r}' if topic else ''}."
            )

        job.stage = "generating_items"
        job.progress = 30
        source_ingestion_repository.update_job(job)

        mcq_min = max(1, int(count * 0.8)) # Bias heavily to MCQ
        open_max = max(1, count - mcq_min)
        
        prompt = QUIZ_SYSTEM_PROMPT.format(
            count=count,
            mcq_min=mcq_min,
            open_max=open_max,
        )

        llm = get_llm_provider(role="structured")
        config = GenerationConfig(temperature=0.4, response_format="json_object")
        
        # User difficulty override
        if difficulty:
            prompt += f"\nEnsure all questions target {difficulty} difficulty."
        if topic:
            prompt += f"\nFocus every question on the topic: {topic}."

        resp = await llm.generate(prompt=prompt, context=list(evidence_chunks.values()), config=config)
        
        job.stage = "saving_items"
        job.progress = 80
        source_ingestion_repository.update_job(job)

        try:
            parsed = json.loads(resp.content)
            items_data = parsed.get("items", [])
        except json.JSONDecodeError:
            items_data = []

        valid_count = 0
        now = utc_now()
        
        for item_data in items_data:
            c_ids = item_data.get("citation_ids", [])
            # Must have at least one valid citation matching the provided chunks
            valid_c_ids = [cid for cid in c_ids if cid in evidence_chunks]
            if not valid_c_ids:
                continue

            q_type = QuestionType.MCQ if item_data.get("question_type") == "mcq" else QuestionType.OPEN_ENDED
            quiz_item_id = new_id()
            
            # Create citation records mapping back to the source/chunks
            actual_citation_ids = []
            for chunk_id in valid_c_ids:
                ev = evidence_chunks[chunk_id]
                citation_id = new_id()
                cit = Citation(
                    id=citation_id,
                    notebook_id=notebook_id,
                    output_type=CitationOutputType.QUIZ_ITEM,
                    output_id=quiz_item_id,
                    chunk_id=chunk_id,
                    source_id=ev.source_id,
                    source_title=getattr(ev, 'source_title', "Source"),
                    page_start=getattr(ev, 'page_start', 1),
                    page_end=getattr(ev, 'page_end', 1),
                    created_at=now,
                )
                knowledge_retrieval_repository.create_citation(cit)
                actual_citation_ids.append(citation_id)


            quiz_item = QuizItem(
                id=quiz_item_id,
                notebook_id=notebook_id,
                batch_id=job_id,
                topic=_infer_item_topic(item_data, topic),
                source_ids=list(set(evidence_chunks[cid].source_id for cid in valid_c_ids)),
                question_type=q_type,
                question=item_data.get("question", ""),
                options=item_data.get("options"),
                correct_answer=item_data.get("correct_answer", ""),
                explanation=item_data.get("explanation", ""),
                citation_ids=actual_citation_ids,
                difficulty=item_data.get("difficulty", "recall"),
                bloom_level=item_data.get("bloom_level", 1),
                created_at=now,
            )
            quiz_repository.create_quiz_item(quiz_item)
            valid_count += 1
            if valid_count >= count:
                break

        if valid_count == 0:
            raise ValueError("Quiz generation returned no source-grounded items.")

        job.status = JobStatus.COMPLETED
        job.stage = "completed"
        job.progress = 100
        job.result["items_generated"] = valid_count
        job.result["topic"] = topic
        job.completed_at = utc_now()
        source_ingestion_repository.update_job(job)

    except Exception as e:
        job.status = JobStatus.FAILED
        job.stage = "failed"
        job.progress = 100
        job.error_message = str(e)
        job.completed_at = utc_now()
        source_ingestion_repository.update_job(job)


async def submit_quiz_answer(
    user_id: str,
    notebook_id: str,
    quiz_item_id: str,
    user_answer: str,
) -> dict:
    quiz_item = quiz_repository.get_quiz_item(quiz_item_id)
    if not quiz_item or quiz_item.notebook_id != notebook_id:
        raise ValueError("Quiz item not found")

    is_correct = False
    result_detail = "incorrect"
    matched_concepts = []
    missing_concepts = []
    explanation = quiz_item.explanation

    if quiz_item.question_type == QuestionType.MCQ:
        is_correct = (user_answer.strip().lower() == quiz_item.correct_answer.strip().lower())
        result_detail = "correct" if is_correct else "incorrect"

    else:
        # OPEN ENDED: Use LLM for structured rubric evaluation
        llm = get_llm_provider(role="structured")
        
        # Grab citations for the context
        evidence_chunks = []
        for cit_id in quiz_item.citation_ids:
            cit = knowledge_retrieval_repository.get_citation(cit_id)
            if cit:
                # Need the chunk text
                chunk_list = source_ingestion_repository.list_chunks(cit.source_id) # O(N) fetch, but local
                target_chunk = next((c for c in chunk_list if c.id == cit.chunk_id), None)
                if target_chunk:
                    ev = type("FallbackEv", (), {
                        "chunk_id": target_chunk.id,
                        "source_id": cit.source_id,
                        "source_title": cit.source_title,
                        "content": target_chunk.content,
                        "snippet_text": target_chunk.content
                    })()
                    evidence_chunks.append(ev)
        
        eval_prompt = OPEN_ENDED_EVALUATION_PROMPT.format(
            question=quiz_item.question,
            canonical_answer=quiz_item.correct_answer,
            explanation=quiz_item.explanation,
            student_answer=user_answer,
        )
        
        config = GenerationConfig(temperature=0.1, response_format="json_object")
        resp = await llm.generate(prompt=eval_prompt, context=evidence_chunks, config=config)
        
        try:
            parsed = json.loads(resp.content)
            result_detail = parsed.get("result", "incorrect")
            is_correct = (result_detail in ["correct", "partially_correct"])
            matched_concepts = parsed.get("matched_concepts", [])
            missing_concepts = parsed.get("missing_concepts", [])
            explanation = parsed.get("explanation", quiz_item.explanation)
        except json.JSONDecodeError:
            is_correct = False

    attempt = QuizAttempt(
        id=new_id(),
        notebook_id=notebook_id,
        user_id=user_id,
        quiz_item_id=quiz_item.id,
        user_answer=user_answer,
        is_correct=is_correct,
        created_at=utc_now(),
    )
    quiz_repository.create_quiz_attempt(attempt)
    
    # Return structured frontend payload
    citations = []
    for cit_id in quiz_item.citation_ids:
        cit = knowledge_retrieval_repository.get_citation(cit_id)
        if cit:
            citations.append(cit.model_dump(mode="json"))

    return {
        "attempt": attempt.model_dump(mode="json"),
        "result": result_detail,
        "matched_concepts": matched_concepts,
        "missing_concepts": missing_concepts,
        "explanation": explanation,
        "citations": citations,
        "correct_answer": quiz_item.correct_answer if not is_correct else None
    }
