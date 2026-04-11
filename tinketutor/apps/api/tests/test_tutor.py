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


def _create_notebook(client, auth_headers, *, title: str = "Cell Biology") -> str:
    response = client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": title, "description": "Tutor test notebook"},
    )
    assert response.status_code == 201
    return response.json()["notebook"]["id"]


def _upload_ready_source(client, auth_headers, notebook_id: str) -> None:
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
    job_id = upload_response.json()["jobId"]

    for _ in range(30):
        job_response = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
        assert job_response.status_code == 200
        job = job_response.json()["job"]
        if job["status"] in {"completed", "failed"}:
            assert job["status"] == "completed"
            return
        time.sleep(0.1)

    raise AssertionError("Timed out waiting for ingestion to complete")


def test_tutor_start_session_returns_guided_turn_with_evidence(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers)
    _upload_ready_source(client, auth_headers, notebook_id)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={
            "query": "What is cellular respiration?",
        },
    )
    assert response.status_code == 201

    payload = response.json()
    session = payload["session"]
    turn = payload["turn"]

    assert session["notebook_id"] == notebook_id
    assert session["current_state"] == "retrieval_prompt"
    assert session["current_mode"] == "onboarding"
    assert session["message_count"] == 1
    assert turn["role"] == "tutor"
    assert turn["tutor_state"] == "retrieval_prompt"
    assert turn["follow_up_required"] is True
    assert turn["escalation_available"] is True
    assert turn["suggested_actions"] == [{"id": "open_sources", "kind": "navigate"}]
    assert turn["citations"]
    assert turn["evidence_items"]
    assert turn["insufficient_grounding"] is False


def test_tutor_grounded_follow_up_transitions_session_to_studying(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Tutor Mode Transition")
    _upload_ready_source(client, auth_headers, notebook_id)

    start_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "What converts glucose into ATP inside the mitochondria?"},
    )
    assert start_response.status_code == 201
    session_id = start_response.json()["session"]["id"]

    continue_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "The source says cellular respiration converts glucose into ATP inside the mitochondria. Is that the key idea?"},
    )
    assert continue_response.status_code == 200

    payload = continue_response.json()
    assert payload["session"]["current_mode"] == "studying"
    assert payload["turn"]["suggested_actions"] == [
        {"id": "open_knowledge_map", "kind": "navigate"},
        {"id": "open_quiz", "kind": "navigate"},
    ]


def test_tutor_escalation_allows_direct_answer_only_after_explicit_request(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Escalation Notebook")
    _upload_ready_source(client, auth_headers, notebook_id)

    start_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "What converts glucose into ATP inside the mitochondria?"},
    )
    assert start_response.status_code == 201
    session_id = start_response.json()["session"]["id"]

    escalate_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/{session_id}/escalate",
        headers=auth_headers,
        json={"action": "give_me_the_answer"},
    )
    assert escalate_response.status_code == 200

    turn = escalate_response.json()["turn"]
    assert turn["tutor_state"] == "direct_answer_escalated"
    assert turn["message_type"] == "direct_answer"
    assert turn["citations"]
    assert turn["evidence_items"]
    assert "source-grounded" in turn["message"].lower() or "kildebaseret" in turn["message"].lower()


def test_tutor_returns_explicit_insufficient_grounding_when_notebook_is_not_ready(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Empty Tutor Notebook")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "Explain cellular respiration."},
    )
    assert response.status_code == 201

    turn = response.json()["turn"]
    session = response.json()["session"]
    assert session["current_mode"] == "onboarding"
    assert turn["tutor_state"] == "insufficient_grounding"
    assert turn["insufficient_grounding"] is True
    assert turn["suggested_actions"] == [{"id": "open_sources", "kind": "navigate"}]
    assert turn["citations"] == []
    assert turn["evidence_items"] == []
    assert turn["escalation_available"] is False


def test_tutor_start_session_honors_explicit_locale_override(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Tutor Locale Override")
    _upload_ready_source(client, auth_headers, notebook_id)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={
            "query": "What is cellular respiration?",
            "locale": "da",
        },
    )
    assert response.status_code == 201

    payload = response.json()
    assert payload["session"]["language"] == "da"
    assert payload["turn"]["language"] == "da"
    assert "Før vi løser det" in payload["turn"]["message"]


def test_tutor_continue_session_keeps_session_locale_when_request_omits_it(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Tutor Locale Follow-up")
    _upload_ready_source(client, auth_headers, notebook_id)

    start_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={
            "query": "What is cellular respiration?",
            "locale": "da",
        },
    )
    assert start_response.status_code == 201
    session_id = start_response.json()["session"]["id"]

    continue_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"content": "Can you help me narrow it down?"},
    )
    assert continue_response.status_code == 200

    payload = continue_response.json()
    assert payload["session"]["language"] == "da"
    assert payload["turn"]["language"] == "da"
    assert payload["turn"]["message"]


def test_tutor_start_session_defaults_to_language_inference_when_locale_is_omitted(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Tutor Locale Inference")
    _upload_ready_source(client, auth_headers, notebook_id)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "What is cellular respiration?"},
    )
    assert response.status_code == 201

    payload = response.json()
    assert payload["session"]["language"] == "en"
    assert payload["turn"]["language"] == "en"
