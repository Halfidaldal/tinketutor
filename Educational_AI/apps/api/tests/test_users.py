from __future__ import annotations

from app.repositories import user_repository


def test_get_users_me_creates_persisted_profile_on_first_access(client, auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()["user"]
    assert payload["id"] == "test-user"
    assert payload["email"] == "test-user@example.com"
    assert payload["displayName"] == "Test User"
    assert payload["preferences"]["language"] == "en"
    assert payload["usage"] == {"sources_uploaded": 0, "quizzes_taken": 0}

    persisted = user_repository.get_by_id("test-user")
    assert persisted is not None
    assert persisted.email == "test-user@example.com"
    assert persisted.display_name == "Test User"

    second_response = client.get("/api/v1/users/me", headers=auth_headers)
    assert second_response.status_code == 200
    assert second_response.json()["user"]["createdAt"] == payload["createdAt"]


def test_put_users_me_updates_display_name_and_preferences(client, auth_headers):
    create_response = client.get("/api/v1/users/me", headers=auth_headers)
    assert create_response.status_code == 200

    update_response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "displayName": "Updated Test User",
            "preferences": {"language": "da"},
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()["user"]
    assert payload["displayName"] == "Updated Test User"
    assert payload["preferences"]["language"] == "da"

    persisted = user_repository.get_by_id("test-user")
    assert persisted is not None
    assert persisted.display_name == "Updated Test User"
    assert persisted.preferences.language.value == "da"
