"""
Application Configuration

Environment-based configuration using Pydantic Settings.
All secrets and deployment-specific values come from environment variables.

See .env.example for the full list of expected variables.
"""

import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Environment ---
    environment: str = "local"  # local | dev | staging | prod

    # --- CORS ---
    cors_origins: list[str] = Field(default_factory=lambda: [
        "http://localhost:3000",
        "https://tinktetutor-web.vercel.app",
        "https://tinketutor-web.vercel.app",
        "https://tinketutor-ay00aaw6h-kontakt-4031s-projects.vercel.app"
    ])

    # --- Firebase ---
    firebase_project_id: str = ""
    firebase_storage_bucket: str = ""
    # Path to service account JSON. Empty = use ADC (Application Default Credentials).
    google_application_credentials: str = ""
    firebase_auth_emulator_host: str = ""
    firestore_emulator_host: str = ""
    storage_emulator_host: str = ""

    # --- Local development seams ---
    object_store_backend: str = "firebase"
    parser_backend: str = "local"
    local_storage_dir: str = ".local_storage"

    # --- LLM Provider ---
    # Which LLM provider to use: "google_vertex" | "openai"
    llm_provider: str = "google_vertex"

    # Google Vertex AI / Gemini
    google_cloud_project: str = ""
    google_cloud_location: str = "europe-west1"
    gemini_model: str = "gemini-2.5-flash"
    embedding_model: str = "text-embedding-004"
    vertex_model_tutor: str = ""
    vertex_model_structured: str = ""
    vertex_embedding: str = ""

    # OpenAI (stubbed for v1)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # --- Localization ---
    default_locale: str = "da"
    supported_locales: list[str] = Field(default_factory=lambda: ["da", "en"])

    # --- Chunking ---
    chunk_target_tokens: int = 500
    chunk_overlap_tokens: int = 50

    # --- Search ---
    search_top_k: int = 10
    search_similarity_threshold: float = 0.3
    lexical_search_min_score: float = 0.15
    search_partial_support_threshold: float = 0.45
    search_strong_support_threshold: float = 0.7
    retrieval_enable_vector: bool = True

    # --- Canvas ---
    canvas_node_target: int = 12
    canvas_skeleton_nodes: int = 3

    # --- Quiz ---
    quiz_default_count: int = 5

    # --- Tutor ---
    tutor_max_messages: int = 20

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            if raw_value.startswith("["):
                parsed_value = json.loads(raw_value)
                if not isinstance(parsed_value, list):
                    raise ValueError("CORS_ORIGINS JSON value must decode to a list")
                return [origin.strip() for origin in parsed_value if isinstance(origin, str) and origin.strip()]
            return [origin.strip() for origin in raw_value.split(",") if origin.strip()]
        return value

    @field_validator("supported_locales", mode="before")
    @classmethod
    def parse_supported_locales(cls, value: object) -> object:
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            if raw_value.startswith("["):
                parsed_value = json.loads(raw_value)
                if not isinstance(parsed_value, list):
                    raise ValueError("SUPPORTED_LOCALES JSON value must decode to a list")
                return [
                    locale.strip().lower()
                    for locale in parsed_value
                    if isinstance(locale, str) and locale.strip()
                ]
            return [locale.strip().lower() for locale in raw_value.split(",") if locale.strip()]
        return value

    @field_validator("default_locale", mode="before")
    @classmethod
    def normalize_default_locale(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("vertex_model_tutor", "vertex_model_structured", "vertex_embedding", mode="before")
    @classmethod
    def normalize_optional_model_strings(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @property
    def resolved_tutor_model(self) -> str:
        return self.vertex_model_tutor or self.gemini_model

    @property
    def resolved_structured_model(self) -> str:
        return self.vertex_model_structured or self.gemini_model

    @property
    def resolved_embedding_model(self) -> str:
        return self.vertex_embedding or self.embedding_model


settings = Settings()
