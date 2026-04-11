from __future__ import annotations


def test_protected_endpoint_requires_bearer_token(client):
    response = client.get("/api/v1/notebooks")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing authentication token"


def test_protected_endpoint_rejects_invalid_bearer_token(client):
    response = client.get(
        "/api/v1/notebooks",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


def test_protected_endpoint_accepts_valid_bearer_token(client, auth_headers):
    response = client.get("/api/v1/notebooks", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"notebooks": []}
