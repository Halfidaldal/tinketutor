"""
Seam 3: VectorStore — Abstract Base Class

File: backend/app/providers/vector_store.py
Per phase-2-implementation-seams.md §Seam 3:

v1 uses Firestore + numpy. v2 will use dedicated vector DB.
The search service must not know or care which.

Leak check: search_service.py must call VectorStore.search(),
never numpy directly.

Implementations:
- FirestoreVectorStore (v1: Firestore + numpy cosine similarity)
- Future: QdrantVectorStore, VertexVectorStore
"""

from abc import ABC, abstractmethod

from app.domain.models import ChunkWithEmbedding, ScoredChunk


class VectorStore(ABC):
    """
    Abstract vector storage and search interface.

    Per ADR-5 (phase-2-technical-architecture-pack.md §12):
    Embeddings stored as float arrays. In-memory cosine similarity via numpy.
    Migration path to dedicated vector store is clean via this abstraction.
    """

    @abstractmethod
    async def store_embeddings(self, chunks: list[ChunkWithEmbedding]) -> None:
        """
        Store chunk embeddings.

        Args:
            chunks: List of chunks with their embedding vectors
        """
        ...

    @abstractmethod
    async def search(
        self,
        query_embedding: list[float],
        source_ids: list[str],
        top_k: int = 10,
    ) -> list[ScoredChunk]:
        """
        Search for similar chunks by embedding similarity.

        Per TG-3: Search is always notebook-scoped via source_ids.

        Args:
            query_embedding: The query vector
            source_ids: Only search chunks from these sources
            top_k: Number of results to return

        Returns:
            List of ScoredChunk sorted by descending similarity
        """
        ...
