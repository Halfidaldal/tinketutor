from __future__ import annotations

from app.domain.enums import SourceStatus
from app.domain.models import Citation, CitationAnchor, Chunk, Source
from app.infra.firestore import (
    notebook_citation_document,
    source_anchors_collection,
    source_chunk_document,
    sources_collection,
)
from app.repositories import source_ingestion_repository
from app.repositories._firestore_utils import (
    collection_group_first_model,
    collection_group_models,
    load_models,
    save_model,
)


def list_ready_sources(notebook_id: str, user_id: str) -> list[Source]:
    query = (
        sources_collection()
        .where("notebook_id", "==", notebook_id)
        .where("user_id", "==", user_id)
        .where("status", "==", SourceStatus.READY.value)
    )
    sources = [
        Source.model_validate(snapshot.to_dict())
        for snapshot in query.stream()
        if snapshot.exists
    ]
    sources.sort(key=lambda source: source.created_at, reverse=True)
    return sources


def get_source(source_id: str) -> Source | None:
    return source_ingestion_repository.get_source(source_id)


def list_chunks_for_source_ids(source_ids: list[str]) -> list[Chunk]:
    chunks: list[Chunk] = []
    for source_id in source_ids:
        chunks.extend(source_ingestion_repository.list_chunks(source_id))
    chunks.sort(key=lambda chunk: (chunk.source_id, chunk.order_index))
    return chunks


def get_chunk(chunk_id: str) -> Chunk | None:
    return collection_group_first_model("chunks", Chunk, id=chunk_id)


def set_chunk_embedding(chunk_id: str, embedding: list[float]) -> Chunk | None:
    chunk = get_chunk(chunk_id)
    if not chunk:
        return None

    chunk.embedding = embedding
    return save_model(source_chunk_document(chunk.source_id, chunk.id), chunk)


def list_anchors_for_chunk(chunk_id: str) -> list[CitationAnchor]:
    anchors = collection_group_models("citationAnchors", CitationAnchor, chunk_id=chunk_id)
    anchors.sort(key=lambda anchor: anchor.order_index)
    return anchors


def list_anchors_for_source_chunk(source_id: str, chunk_id: str) -> list[CitationAnchor]:
    query = source_anchors_collection(source_id).where("chunk_id", "==", chunk_id)
    anchors = load_models(query.stream(), CitationAnchor)
    anchors.sort(key=lambda anchor: anchor.order_index)
    return anchors


def get_anchor(anchor_id: str) -> CitationAnchor | None:
    return collection_group_first_model("citationAnchors", CitationAnchor, id=anchor_id)


def create_citation(citation: Citation) -> Citation:
    return save_model(notebook_citation_document(citation.notebook_id, citation.id), citation)


def get_citation(citation_id: str) -> Citation | None:
    return collection_group_first_model("citations", Citation, id=citation_id)


def list_citations_for_output(output_id: str) -> list[Citation]:
    citations = collection_group_models("citations", Citation, output_id=output_id)
    citations.sort(key=lambda citation: citation.created_at)
    return citations
