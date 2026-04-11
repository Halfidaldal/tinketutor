from __future__ import annotations

from abc import ABC, abstractmethod

from app.providers.base import LLMProvider


class EmbeddingProvider(ABC):
    """Typed seam for query/document embeddings used by retrieval."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class NoOpEmbeddingProvider(EmbeddingProvider):
    """Development-safe embedding seam used until real embeddings are enabled."""

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return []


class LLMEmbeddingProvider(EmbeddingProvider):
    """Adapter that exposes LLMProvider.embed through the dedicated retrieval seam."""

    def __init__(self, llm_provider: LLMProvider) -> None:
        self._llm_provider = llm_provider

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await self._llm_provider.embed(texts)
