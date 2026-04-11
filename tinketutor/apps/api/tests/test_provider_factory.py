from __future__ import annotations

from unittest.mock import patch

import pytest

from app.config import Settings
from app.providers import factory


def test_settings_parse_supported_locales_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPPORTED_LOCALES", '["da","en"]')
    monkeypatch.setenv("DEFAULT_LOCALE", "da")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-legacy")
    monkeypatch.setenv("EMBEDDING_MODEL", "text-embedding-legacy")

    settings = Settings()

    assert settings.supported_locales == ["da", "en"]
    assert settings.default_locale == "da"


def test_get_llm_provider_uses_role_specific_vertex_models_with_legacy_fallback(monkeypatch) -> None:
    captured_calls: list[dict[str, str]] = []

    class FakeGoogleVertexProvider:
        def __init__(self, *, project: str, location: str, model: str, embedding_model: str) -> None:
            captured_calls.append(
                {
                    "project": project,
                    "location": location,
                    "model": model,
                    "embedding_model": embedding_model,
                }
            )

    monkeypatch.setattr(factory.settings, "llm_provider", "google_vertex")
    monkeypatch.setattr(factory.settings, "google_cloud_project", "tinketutor-demo")
    monkeypatch.setattr(factory.settings, "google_cloud_location", "europe-west1")
    monkeypatch.setattr(factory.settings, "gemini_model", "gemini-legacy")
    monkeypatch.setattr(factory.settings, "embedding_model", "text-embedding-legacy")
    monkeypatch.setattr(factory.settings, "vertex_model_tutor", "gemini-tutor", raising=False)
    monkeypatch.setattr(factory.settings, "vertex_model_structured", "", raising=False)
    monkeypatch.setattr(factory.settings, "vertex_embedding", "", raising=False)

    with patch("app.providers.google_vertex.GoogleVertexProvider", FakeGoogleVertexProvider):
        factory.get_llm_provider(role="tutor")
        factory.get_llm_provider(role="structured")

    assert captured_calls == [
        {
            "project": "tinketutor-demo",
            "location": "europe-west1",
            "model": "gemini-tutor",
            "embedding_model": "text-embedding-legacy",
        },
        {
            "project": "tinketutor-demo",
            "location": "europe-west1",
            "model": "gemini-legacy",
            "embedding_model": "text-embedding-legacy",
        },
    ]


def test_get_llm_provider_uses_explicit_structured_and_embedding_overrides(monkeypatch) -> None:
    captured_calls: list[dict[str, str]] = []

    class FakeGoogleVertexProvider:
        def __init__(self, *, project: str, location: str, model: str, embedding_model: str) -> None:
            captured_calls.append(
                {
                    "project": project,
                    "location": location,
                    "model": model,
                    "embedding_model": embedding_model,
                }
            )

    monkeypatch.setattr(factory.settings, "llm_provider", "google_vertex")
    monkeypatch.setattr(factory.settings, "google_cloud_project", "tinketutor-demo")
    monkeypatch.setattr(factory.settings, "google_cloud_location", "europe-west1")
    monkeypatch.setattr(factory.settings, "gemini_model", "gemini-legacy")
    monkeypatch.setattr(factory.settings, "embedding_model", "text-embedding-legacy")
    monkeypatch.setattr(factory.settings, "vertex_model_tutor", "", raising=False)
    monkeypatch.setattr(factory.settings, "vertex_model_structured", "gemini-structured", raising=False)
    monkeypatch.setattr(factory.settings, "vertex_embedding", "text-embedding-phase1", raising=False)

    with patch("app.providers.google_vertex.GoogleVertexProvider", FakeGoogleVertexProvider):
        factory.get_llm_provider(role="structured")

    assert captured_calls == [
        {
            "project": "tinketutor-demo",
            "location": "europe-west1",
            "model": "gemini-structured",
            "embedding_model": "text-embedding-phase1",
        }
    ]
