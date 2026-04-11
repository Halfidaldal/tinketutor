from __future__ import annotations

import io
import time
import zipfile


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


def test_source_upload_processes_chunks_and_status(client, auth_headers):
    notebook_response = client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": "Cell Biology", "description": "Respiration notes"},
    )
    assert notebook_response.status_code == 201
    notebook_id = notebook_response.json()["notebook"]["id"]

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
    upload_payload = upload_response.json()
    source_id = upload_payload["source"]["id"]
    job_id = upload_payload["jobId"]

    terminal_job = None
    for _ in range(30):
        job_response = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
        assert job_response.status_code == 200
        terminal_job = job_response.json()["job"]
        if terminal_job["status"] in {"completed", "failed"}:
            break
        time.sleep(0.1)

    assert terminal_job is not None
    assert terminal_job["status"] == "completed"

    source_status = client.get(f"/api/v1/sources/{source_id}/status", headers=auth_headers)
    assert source_status.status_code == 200
    status_payload = source_status.json()

    assert status_payload["source"]["status"] == "ready"
    assert status_payload["source"]["chunk_count"] >= 1
    assert status_payload["source"]["parser_type"] == "docx_zip_xml"
    assert status_payload["anchor_count"] == status_payload["source"]["chunk_count"]
    assert status_payload["job"]["stage"] == "completed"

    chunks_response = client.get(f"/api/v1/sources/{source_id}/chunks", headers=auth_headers)
    assert chunks_response.status_code == 200
    chunks_payload = chunks_response.json()
    assert chunks_payload["total"] == status_payload["source"]["chunk_count"]
    assert any("mitochondria" in chunk["content"].lower() for chunk in chunks_payload["chunks"])


def test_source_upload_rejects_unsupported_file_types(client, auth_headers):
    notebook_response = client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": "Chemistry", "description": ""},
    )
    notebook_id = notebook_response.json()["notebook"]["id"]

    upload_response = client.post(
        "/api/v1/sources",
        headers=auth_headers,
        data={"title": "Bad Source", "notebookId": notebook_id},
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )

    assert upload_response.status_code == 400
    assert "not supported" in upload_response.json()["detail"].lower()
