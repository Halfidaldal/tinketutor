from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import Chunk, ChunkMetadata, ChunkPosition
from app.services.search_service import _backfill_chunk_embeddings


class _FakeEmbeddingProvider:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(index + 1), float(index + 1)] for index, _text in enumerate(texts)]


class _FakeVectorStore:
    def __init__(self) -> None:
        self.stored = []

    async def store_embeddings(self, chunks) -> None:
        self.stored.extend(chunks)


@pytest.mark.asyncio
async def test_backfill_chunk_embeddings_populates_missing_embeddings() -> None:
    now = datetime.now(UTC)
    chunks = [
        Chunk(
            id="chunk-1",
            notebook_id="nb-1",
            source_id="source-1",
            user_id="user-1",
            content="Asymmetry shapes the outcome.",
            token_count=5,
            embedding=[],
            position=ChunkPosition(page_start=1, page_end=1),
            metadata=ChunkMetadata(),
            created_at=now,
        ),
        Chunk(
            id="chunk-2",
            notebook_id="nb-1",
            source_id="source-1",
            user_id="user-1",
            content="Narrative agency matters.",
            token_count=4,
            embedding=[0.1, 0.2],
            position=ChunkPosition(page_start=1, page_end=1),
            metadata=ChunkMetadata(),
            created_at=now,
        ),
    ]

    vector_store = _FakeVectorStore()
    embedded_count = await _backfill_chunk_embeddings(
        chunks=chunks,
        embedding_provider=_FakeEmbeddingProvider(),
        vector_store=vector_store,
    )

    assert embedded_count == 1
    assert chunks[0].embedding == [1.0, 1.0]
    assert chunks[1].embedding == [0.1, 0.2]
    assert len(vector_store.stored) == 1
    assert vector_store.stored[0].chunk_id == "chunk-1"
