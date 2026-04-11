from __future__ import annotations

from math import sqrt

from app.domain.models import ChunkWithEmbedding, ScoredChunk
from app.providers.vector_store import VectorStore
from app.repositories import knowledge_retrieval_repository


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0

    dot_product = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot_product / (left_norm * right_norm)


class LocalVectorStore(VectorStore):
    """Dev-friendly vector store backed by locally persisted chunk records."""

    async def store_embeddings(self, chunks: list[ChunkWithEmbedding]) -> None:
        for item in chunks:
            knowledge_retrieval_repository.set_chunk_embedding(
                chunk_id=item.chunk_id,
                embedding=item.embedding,
            )

    async def search(
        self,
        query_embedding: list[float],
        source_ids: list[str],
        top_k: int = 10,
    ) -> list[ScoredChunk]:
        if not query_embedding or not source_ids:
            return []

        scored_results: list[ScoredChunk] = []
        for chunk in knowledge_retrieval_repository.list_chunks_for_source_ids(source_ids):
            if not chunk.embedding:
                continue

            score = _cosine_similarity(query_embedding, chunk.embedding)
            if score <= 0:
                continue

            scored_results.append(
                ScoredChunk(
                    chunk_id=chunk.id,
                    source_id=chunk.source_id,
                    score=score,
                )
            )

        scored_results.sort(key=lambda item: item.score, reverse=True)
        return scored_results[:top_k]
