from __future__ import annotations

import io
import time
import zipfile

from app.repositories import source_ingestion_repository


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
        json={"title": title, "description": "Retrieval test notebook"},
    )
    assert response.status_code == 201
    return response.json()["notebook"]["id"]


def _upload_ready_source(client, auth_headers, notebook_id: str) -> tuple[str, str]:
    docx_bytes = _make_minimal_docx(
        [
            "Cellular respiration converts glucose into ATP inside the mitochondria.",
            "Glycolysis occurs in the cytoplasm and produces pyruvate.",
            "The Krebs cycle generates electron carriers for oxidative phosphorylation.",
            "Oxidative phosphorylation uses the electron transport chain to produce most ATP.",
        ]
    )

    upload_response = client.post(
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
    assert upload_response.status_code == 202
    payload = upload_response.json()

    source_id = payload["source"]["id"]
    job_id = payload["jobId"]
    for _ in range(30):
        job_response = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
        assert job_response.status_code == 200
        job = job_response.json()["job"]
        if job["status"] in {"completed", "failed"}:
            assert job["status"] == "completed"
            return source_id, job_id
        time.sleep(0.1)

    raise AssertionError("Timed out waiting for source ingestion job to complete")


def test_notebook_search_returns_traceable_evidence_pack(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers)
    _upload_ready_source(client, auth_headers, notebook_id)

    readiness_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/retrieval-readiness",
        headers=auth_headers,
    )
    assert readiness_response.status_code == 200
    readiness = readiness_response.json()
    assert readiness["retrieval_ready"] is True
    assert readiness["ready_source_count"] == 1
    assert readiness["traceable_chunk_count"] >= 1

    search_response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={
            "notebookId": notebook_id,
            "query": "Cellular respiration converts glucose into ATP inside the mitochondria",
            "topK": 5,
        },
    )
    assert search_response.status_code == 200

    evidence_pack = search_response.json()["evidence_pack"]
    assert evidence_pack["notebook_id"] == notebook_id
    assert evidence_pack["retrieval_mode"] == "lexical"
    assert evidence_pack["support_assessment"] == "supported"
    assert evidence_pack["insufficient_grounding"] is False
    assert len(evidence_pack["top_evidence"]) >= 1

    first_item = evidence_pack["top_evidence"][0]
    assert first_item["chunk_id"]
    assert first_item["source_id"]
    assert first_item["citation_ids"]
    assert first_item["citation_anchor_ids"]
    assert "mitochondria" in first_item["snippet_text"].lower()

    citation_id = first_item["citation_ids"][0]
    citation_response = client.get(f"/api/v1/citations/{citation_id}", headers=auth_headers)
    assert citation_response.status_code == 200
    citation_payload = citation_response.json()

    assert citation_payload["citation"]["id"] == citation_id
    assert citation_payload["citation"]["chunk_id"] == first_item["chunk_id"]
    assert citation_payload["source"]["id"] == first_item["source_id"]
    assert citation_payload["citation_anchors"]
    assert "glucose" in citation_payload["chunk"]["content"].lower() or "mitochondria" in citation_payload["chunk"]["content"].lower()


def test_notebook_search_returns_structured_insufficient_grounding_when_no_ready_sources(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Empty Notebook")

    search_response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={
            "notebookId": notebook_id,
            "query": "What is cellular respiration?",
            "topK": 5,
        },
    )
    assert search_response.status_code == 200

    evidence_pack = search_response.json()["evidence_pack"]
    assert evidence_pack["notebook_id"] == notebook_id
    assert evidence_pack["support_assessment"] == "no_ready_sources"
    assert evidence_pack["insufficient_grounding"] is True
    assert evidence_pack["top_evidence"] == []
    assert "no ready sources" in evidence_pack["insufficiency_reason"].lower()


def test_notebook_search_blocks_untraceable_chunks(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Broken Anchors")
    source_id, _job_id = _upload_ready_source(client, auth_headers, notebook_id)

    assert source_ingestion_repository.list_anchors(source_id)
    source_ingestion_repository.replace_anchors(source_id, [])

    readiness_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/retrieval-readiness",
        headers=auth_headers,
    )
    assert readiness_response.status_code == 200
    readiness = readiness_response.json()
    assert readiness["retrieval_ready"] is False
    assert any("citation anchors are incomplete" in reason.lower() for reason in readiness["blocking_reasons"])

    search_response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={
            "notebookId": notebook_id,
            "query": "Cellular respiration converts glucose into ATP inside the mitochondria",
            "topK": 5,
        },
    )
    assert search_response.status_code == 200

    evidence_pack = search_response.json()["evidence_pack"]
    assert evidence_pack["support_assessment"] == "missing_traceability"
    assert evidence_pack["insufficient_grounding"] is True
    assert evidence_pack["top_evidence"] == []
    assert "citation anchors are missing" in evidence_pack["insufficiency_reason"].lower()


def test_notebook_search_excludes_unreadable_chunks(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Unreadable PDF")
    source_id, _job_id = _upload_ready_source(client, auth_headers, notebook_id)

    gibberish = ("ñr\x08ñJ±CL.<Ý" * 16).strip()
    chunks = [
        chunk.model_copy(update={"content": gibberish})
        for chunk in source_ingestion_repository.list_chunks(source_id)
    ]
    anchors = [
        anchor.model_copy(update={"snippet_text": gibberish})
        for anchor in source_ingestion_repository.list_anchors(source_id)
    ]

    source_ingestion_repository.replace_chunks(source_id, chunks)
    source_ingestion_repository.replace_anchors(source_id, anchors)

    search_response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={
            "notebookId": notebook_id,
            "query": "What does the source say about ATP production?",
            "topK": 5,
        },
    )
    assert search_response.status_code == 200

    evidence_pack = search_response.json()["evidence_pack"]
    assert evidence_pack["support_assessment"] == "insufficient_grounding"
    assert evidence_pack["top_evidence"] == []
    assert "unreadable" in evidence_pack["insufficiency_reason"].lower()

    diagnostics = evidence_pack["diagnostics"]
    assert diagnostics["unreadable_chunk_count"] >= 1
    assert diagnostics["readable_chunk_count"] == 0
