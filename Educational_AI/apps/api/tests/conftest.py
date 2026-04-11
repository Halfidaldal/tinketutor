from __future__ import annotations

import os
import socket
from urllib.parse import urlparse

import pytest
import google.auth
from google.auth.credentials import AnonymousCredentials
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("FIREBASE_PROJECT_ID", "demo-synthesis-studio")
os.environ.setdefault("FIREBASE_STORAGE_BUCKET", "demo-synthesis-studio.appspot.com")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
os.environ.setdefault("STORAGE_EMULATOR_HOST", "127.0.0.1:9199")
os.environ.setdefault("OBJECT_STORE_BACKEND", "firebase")
os.environ.setdefault("PARSER_BACKEND", "local")
os.environ.setdefault("LLM_PROVIDER", "openai")


def _parse_emulator_endpoint(raw_value: str, default_port: int) -> tuple[str, int]:
    normalized_value = raw_value if "://" in raw_value else f"tcp://{raw_value}"
    parsed_value = urlparse(normalized_value)
    host = parsed_value.hostname or "127.0.0.1"
    port = parsed_value.port or default_port
    return host, port


def _assert_emulator_available(name: str, env_name: str, default_port: int) -> None:
    raw_value = os.environ.get(env_name, "").strip()
    if not raw_value:
        raise pytest.UsageError(
            f"Missing {env_name}. Backend tests require the {name} emulator. "
            "Start Firebase emulators with `firebase emulators:start --only auth,firestore,storage` "
            "or run `make acceptance-backend`."
        )

    host, port = _parse_emulator_endpoint(raw_value, default_port)
    try:
        with socket.create_connection((host, port), timeout=0.75):
            return
    except OSError as exc:
        raise pytest.UsageError(
            f"{name} emulator is not reachable at {host}:{port}. "
            "Start Firebase emulators with `firebase emulators:start --only auth,firestore,storage` "
            "or run `make acceptance-backend`."
        ) from exc


def _require_firebase_emulators() -> None:
    if os.environ.get("PYTEST_SKIP_EMULATOR_CHECK") == "1":
        return

    _assert_emulator_available("Auth", "FIREBASE_AUTH_EMULATOR_HOST", 9099)
    _assert_emulator_available("Firestore", "FIRESTORE_EMULATOR_HOST", 8080)
    _assert_emulator_available("Storage", "STORAGE_EMULATOR_HOST", 9199)


_require_firebase_emulators()

# Mock google.auth.default BEFORE any firebase or gcp imports try to resolve credentials
def _fake_default(scopes=None, quota_project_id=None, request=None):
    return AnonymousCredentials(), "demo-synthesis-studio"


google.auth.default = _fake_default

from app.main import app
from app.providers.auth import AuthProvider
from app.providers.base import AuthenticatedUser
from app.infra.firestore import get_firestore_client, get_storage_bucket


class FakeAuthProvider(AuthProvider):
    async def verify_token(self, token: str) -> AuthenticatedUser:
        if token == "test-token":
            return AuthenticatedUser(
                user_id="test-user",
                email="test-user@example.com",
                display_name="Test User",
            )
        if token == "other-user-token":
            return AuthenticatedUser(
                user_id="other-user",
                email="other-user@example.com",
                display_name="Other User",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )


def _clear_firestore() -> None:
    client = get_firestore_client()
    for collection in client.collections():
        for document in collection.list_documents():
            client.recursive_delete(document)


def _clear_storage() -> None:
    bucket = get_storage_bucket()
    for blob in bucket.list_blobs():
        blob.delete()


@pytest.fixture(autouse=True)
def emulator_state(monkeypatch):
    from app import dependencies

    monkeypatch.setattr(dependencies, "get_auth_provider", lambda: FakeAuthProvider())
    _clear_firestore()
    _clear_storage()
    try:
        yield
    finally:
        _clear_firestore()
        _clear_storage()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def other_auth_headers():
    return {"Authorization": "Bearer other-user-token"}
