"""
Phase 2 — Tutor-Led Onboarding tests.

These tests cover the new onboarding turn path that kicks in when the Study
Home shell bootstraps a session before the learner has typed anything. The
tutor must greet the learner in their preferred language, reflect the current
source-availability state, and propose exactly one bounded next action — never
fall back to generic ungrounded chat.
"""

from __future__ import annotations

from tests.test_tutor import _create_notebook, _upload_ready_source


def test_start_session_empty_query_returns_onboarding_turn(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Onboarding Empty State")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "", "locale": "da"},
    )
    assert response.status_code == 201

    payload = response.json()
    session = payload["session"]
    turn = payload["turn"]

    assert session["current_mode"] == "onboarding"
    assert session["current_state"] == "clarify_goal"
    assert turn["role"] == "tutor"
    assert turn["tutor_state"] == "clarify_goal"
    assert turn["language"] == "da"
    assert turn["insufficient_grounding"] is False
    # Empty-state flows MUST guide constructively, not fall back to generic chat.
    assert turn["evidence_items"] == []
    assert turn["citations"] == []
    # Support assessment reflects the fact that no ready sources exist.
    assert turn["support_assessment"] == "no_ready_sources"
    # Primary action is an upload CTA.
    assert {"id": "upload_sources", "kind": "navigate"} in turn["suggested_actions"]


def test_onboarding_turn_empty_state_content_is_in_danish_by_default(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Danish Default Greeting")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": ""},  # no locale — should default to Danish via settings
    )
    assert response.status_code == 201

    turn = response.json()["turn"]
    assert turn["language"] == "da"
    assert "TinkeTutor" in turn["message"]
    assert "upload" in turn["message"].lower()


def test_onboarding_turn_english_greeting_when_response_locale_is_en(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="English Greeting")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "", "responseLocale": "en"},
    )
    assert response.status_code == 201

    payload = response.json()
    assert payload["session"]["language"] == "en"
    assert payload["turn"]["language"] == "en"
    assert payload["turn"]["response_locale"] == "en"
    # English template should be used.
    assert payload["turn"]["message"].startswith("Hi!") or payload["turn"]["message"].startswith(
        "Welcome"
    )


def test_onboarding_turn_ready_state_suggests_knowledge_map_and_quiz(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Ready Onboarding")
    _upload_ready_source(client, auth_headers, notebook_id)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "", "responseLocale": "en"},
    )
    assert response.status_code == 201

    turn = response.json()["turn"]
    assert turn["support_assessment"] is None
    action_ids = [a["id"] for a in turn["suggested_actions"]]
    assert "open_knowledge_map" in action_ids
    assert "open_quiz" in action_ids
    # Still no evidence synthesized for onboarding greetings.
    assert turn["evidence_items"] == []


def test_bootstrap_session_is_idempotent(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Bootstrap Idempotent")

    first = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert first.status_code == 200
    first_payload = first.json()

    second = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert second.status_code == 200
    second_payload = second.json()

    # Same session id — no duplicate onboarding session created.
    assert first_payload["session"]["id"] == second_payload["session"]["id"]
    # Same first turn id — no duplicate greeting appended.
    assert first_payload["turn"]["id"] == second_payload["turn"]["id"]


def test_bootstrap_session_creates_default_onboarding_turn(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Bootstrap Creates Greeting")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert response.status_code == 200

    payload = response.json()
    turn = payload["turn"]
    assert turn["tutor_state"] == "clarify_goal"
    assert turn["language"] == "da"
    assert turn["evidence_items"] == []
    # Grounding guard: empty onboarding must not produce insufficient_grounding errors.
    assert turn["insufficient_grounding"] is False


def test_response_locale_overrides_legacy_locale(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Response Locale Override")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/tutor/sessions",
        headers=auth_headers,
        json={"query": "", "locale": "da", "responseLocale": "en"},
    )
    assert response.status_code == 201

    turn = response.json()["turn"]
    assert turn["language"] == "en"
    assert turn["response_locale"] == "en"


def test_notebook_bootstrap_creates_default_study_space_when_none_exist(client, auth_headers):
    response = client.post(
        "/api/v1/notebooks/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["created"] is True
    assert payload["notebook"]["title"] == "Din studieplads"


def test_notebook_bootstrap_returns_existing_study_space(client, auth_headers):
    first = client.post(
        "/api/v1/notebooks/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert first.status_code == 200
    first_id = first.json()["notebook"]["id"]

    second = client.post(
        "/api/v1/notebooks/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "da"},
    )
    assert second.status_code == 200
    second_payload = second.json()
    assert second_payload["created"] is False
    assert second_payload["notebook"]["id"] == first_id


def test_notebook_bootstrap_default_title_is_english_when_response_locale_is_en(client, auth_headers):
    response = client.post(
        "/api/v1/notebooks/bootstrap",
        headers=auth_headers,
        json={"responseLocale": "en"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["notebook"]["title"] == "Your study space"
