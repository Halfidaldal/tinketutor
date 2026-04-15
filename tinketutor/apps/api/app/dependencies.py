"""
FastAPI Dependency Injection

Provides request-scoped dependencies for:
- Authenticated user (Firebase Auth token verification)
- LLM provider instance
- Firestore client
- Storage client

Per TG-2: Services receive providers via DI, never import vendor SDKs directly.
Per phase-2-implementation-seams.md: All 5 provider seams are injected here.
"""

from fastapi import Header, HTTPException, status

from app.providers.factory import (
    get_llm_provider,
    get_parser_provider,
    get_vector_store,
    get_object_store,
    get_auth_provider,
    get_embedding_provider,
    get_reranker,
)
from app.providers.base import LLMProvider, AuthenticatedUser
from app.providers.embedding import EmbeddingProvider
from app.providers.parser import ParserProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.providers.object_store import ObjectStore
from app.providers.auth import AuthProvider


async def get_current_user(
    authorization: str | None = Header(default=None, description="Bearer <Firebase ID Token>"),
) -> AuthenticatedUser:
    """
    Validate Firebase Auth token and return the authenticated user.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'",
        )

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    auth_provider = get_auth_provider()
    return await auth_provider.verify_token(token)


def get_llm() -> LLMProvider:
    """Backward-compatible alias for the structured LLM provider."""
    return get_structured_llm()


def get_structured_llm() -> LLMProvider:
    """Get the configured structured-output LLM provider instance."""
    return get_llm_provider(role="structured")


def get_tutor_llm() -> LLMProvider:
    """Get the configured tutor LLM provider instance."""
    return get_llm_provider(role="tutor")


def get_mindmap_llm() -> LLMProvider:
    """Get the configured mindmap LLM provider instance."""
    return get_llm_provider(role="mindmap")


def get_parser() -> ParserProvider:
    """Get the configured parser provider instance."""
    return get_parser_provider()


def get_vectors() -> VectorStore:
    """Get the configured vector store instance."""
    return get_vector_store()


def get_embeddings() -> EmbeddingProvider:
    """Get the configured embedding provider."""
    return get_embedding_provider()


def get_rerankers() -> Reranker:
    """Get the configured reranker."""
    return get_reranker()


def get_storage() -> ObjectStore:
    """Get the configured object store instance."""
    return get_object_store()
