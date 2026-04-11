"""
Provider Factory

Creates provider instances based on application config.
Per ADR-6: Factory pattern selects provider based on config.

Usage in dependency injection:
    llm = get_llm_provider()
    parser = get_parser_provider()
    vectors = get_vector_store()
    storage = get_object_store()
    auth = get_auth_provider()
"""

from app.config import settings
from app.providers.base import LLMProvider
from app.providers.embedding import EmbeddingProvider, LLMEmbeddingProvider, NoOpEmbeddingProvider
from app.providers.parser import ParserProvider
from app.providers.reranker import IdentityReranker, Reranker
from app.providers.vector_store import VectorStore
from app.providers.object_store import ObjectStore
from app.providers.auth import AuthProvider


def get_llm_provider() -> LLMProvider:
    """
    Create LLM provider based on config.
    
    TODO: [Phase 1] Return real GoogleVertexProvider with initialized client.
    """
    if settings.llm_provider == "google_vertex":
        from app.providers.google_vertex import GoogleVertexProvider
        return GoogleVertexProvider(
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
            model=settings.gemini_model,
            embedding_model=settings.embedding_model,
        )
    elif settings.llm_provider == "openai":
        from app.providers.openai_provider import OpenAIProvider
        return OpenAIProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")


def get_parser_provider() -> ParserProvider:
    """Create parser provider."""
    if settings.parser_backend == "local":
        from app.providers.local_parser import DevelopmentParserProvider

        return DevelopmentParserProvider()
    raise ValueError(f"Unknown parser backend: {settings.parser_backend}")


def get_vector_store() -> VectorStore:
    """Create vector store."""
    from app.providers.local_vector_store import LocalVectorStore

    return LocalVectorStore()


def get_embedding_provider() -> EmbeddingProvider:
    """Create embedding provider for retrieval."""
    if not settings.retrieval_enable_vector:
        return NoOpEmbeddingProvider()
    return LLMEmbeddingProvider(get_llm_provider())


def get_reranker() -> Reranker:
    """Create reranker for retrieval."""
    return IdentityReranker()


def get_object_store() -> ObjectStore:
    """Create object store."""
    if settings.object_store_backend == "local":
        from app.infra.storage import LocalObjectStore

        return LocalObjectStore(settings.local_storage_dir)
    if settings.object_store_backend == "firebase":
        from app.infra.storage import CloudStorageObjectStore

        return CloudStorageObjectStore()
    raise ValueError(f"Unknown object store backend: {settings.object_store_backend}")


def get_auth_provider() -> AuthProvider:
    """Create auth provider."""
    from app.providers.firebase_auth import FirebaseAuthProvider

    return FirebaseAuthProvider()
