from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.models import EvidenceChunk


class Reranker(ABC):
    """Typed seam for reranking retrieved evidence items."""

    @abstractmethod
    async def rerank(self, query: str, items: list[EvidenceChunk]) -> list[EvidenceChunk]:
        ...


class IdentityReranker(Reranker):
    """Default v1 reranker that preserves the incoming order."""

    async def rerank(self, query: str, items: list[EvidenceChunk]) -> list[EvidenceChunk]:
        return items
