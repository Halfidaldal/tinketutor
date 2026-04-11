from __future__ import annotations

from app.domain.enums import CitationOutputType, EvidenceSupport
from app.domain.models import Citation, CitationAnchor, Chunk, EvidenceChunk, Source, TutorEvidenceReference
from app.infra.store import new_id, utc_now
from app.repositories import knowledge_retrieval_repository


def validate_traceability(
    *,
    notebook_id: str,
    source: Source | None,
    chunk: Chunk | None,
    anchors: list[CitationAnchor],
) -> tuple[bool, str | None]:
    if source is None or chunk is None:
        return False, "Missing persisted source or chunk record"

    if source.notebook_id != notebook_id or chunk.notebook_id != notebook_id:
        return False, "Source or chunk is outside the notebook scope"

    if chunk.source_id != source.id:
        return False, "Chunk does not belong to the source record"

    if not anchors:
        return False, "Citation anchors are missing for this chunk"

    for anchor in anchors:
        if anchor.notebook_id != notebook_id:
            return False, "Citation anchor is outside the notebook scope"
        if anchor.chunk_id != chunk.id:
            return False, "Citation anchor does not belong to the chunk"
        if anchor.source_id != source.id:
            return False, "Citation anchor does not belong to the source"

    return True, None


def create_retrieval_citation(
    *,
    notebook_id: str,
    evidence_pack_id: str,
    source: Source,
    chunk: Chunk,
    anchor: CitationAnchor,
    score: float,
) -> Citation:
    citation = Citation(
        id=new_id(),
        notebook_id=notebook_id,
        output_type=CitationOutputType.RETRIEVAL_RESULT,
        output_id=evidence_pack_id,
        chunk_id=chunk.id,
        source_id=source.id,
        source_title=source.title,
        page_start=anchor.page_start,
        page_end=anchor.page_end,
        section_title=anchor.section_title,
        relevance_score=score,
        created_at=utc_now(),
    )
    knowledge_retrieval_repository.create_citation(citation)
    return citation


def create_output_citation_from_evidence(
    *,
    notebook_id: str,
    output_type: CitationOutputType,
    output_id: str,
    evidence_item: EvidenceChunk | TutorEvidenceReference,
) -> Citation:
    citation = Citation(
        id=new_id(),
        notebook_id=notebook_id,
        output_type=output_type,
        output_id=output_id,
        chunk_id=evidence_item.chunk_id,
        source_id=evidence_item.source_id,
        source_title=evidence_item.source_title,
        page_start=evidence_item.page_start,
        page_end=evidence_item.page_end,
        section_title=evidence_item.section_title,
        relevance_score=evidence_item.score,
        created_at=utc_now(),
    )
    knowledge_retrieval_repository.create_citation(citation)
    return citation


def build_traceable_evidence_chunk(
    *,
    notebook_id: str,
    evidence_pack_id: str,
    source: Source,
    chunk: Chunk,
    anchors: list[CitationAnchor],
    score: float,
    rank: int,
    support: EvidenceSupport,
    keyword_score: float,
    vector_score: float,
) -> EvidenceChunk | None:
    is_valid, _reason = validate_traceability(
        notebook_id=notebook_id,
        source=source,
        chunk=chunk,
        anchors=anchors,
    )
    if not is_valid:
        return None

    citation_anchor_ids = [anchor.id for anchor in anchors]
    snippet_text = anchors[0].snippet_text or chunk.content[:500]
    citation = create_retrieval_citation(
        notebook_id=notebook_id,
        evidence_pack_id=evidence_pack_id,
        source=source,
        chunk=chunk,
        anchor=anchors[0],
        score=score,
    )

    return EvidenceChunk(
        chunk_id=chunk.id,
        source_id=source.id,
        source_title=source.title,
        content=chunk.content,
        snippet_text=snippet_text,
        page_start=anchors[0].page_start,
        page_end=anchors[0].page_end,
        section_title=anchors[0].section_title,
        citation_anchor_ids=citation_anchor_ids,
        citation_ids=[citation.id],
        score=score,
        rank=rank,
        support=support,
        keyword_score=keyword_score,
        vector_score=vector_score,
    )


def resolve_citation(citation_id: str, user_id: str) -> dict | None:
    citation = knowledge_retrieval_repository.get_citation(citation_id)
    if not citation:
        return None

    source = knowledge_retrieval_repository.get_source(citation.source_id)
    chunk = knowledge_retrieval_repository.get_chunk(citation.chunk_id)
    if not source or source.user_id != user_id or not chunk:
        return None

    anchors = knowledge_retrieval_repository.list_anchors_for_source_chunk(chunk.source_id, chunk.id)
    return {
        "citation": citation.model_dump(mode="json"),
        "chunk": chunk.model_dump(mode="json"),
        "source": source.model_dump(mode="json"),
        "citation_anchors": [anchor.model_dump(mode="json") for anchor in anchors],
    }


def resolve_citation_anchor(anchor_id: str, user_id: str) -> dict | None:
    anchor = knowledge_retrieval_repository.get_anchor(anchor_id)
    if not anchor:
        return None

    source = knowledge_retrieval_repository.get_source(anchor.source_id)
    chunk = knowledge_retrieval_repository.get_chunk(anchor.chunk_id)
    if not source or source.user_id != user_id or not chunk:
        return None

    return {
        "citation_anchor": anchor.model_dump(mode="json"),
        "chunk": chunk.model_dump(mode="json"),
        "source": source.model_dump(mode="json"),
    }


def resolve_chunk(chunk_id: str, user_id: str) -> dict | None:
    chunk = knowledge_retrieval_repository.get_chunk(chunk_id)
    if not chunk:
        return None

    source = knowledge_retrieval_repository.get_source(chunk.source_id)
    if not source or source.user_id != user_id:
        return None

    anchors = knowledge_retrieval_repository.list_anchors_for_source_chunk(chunk.source_id, chunk.id)
    return {
        "chunk": chunk.model_dump(mode="json"),
        "source": source.model_dump(mode="json"),
        "citation_anchors": [anchor.model_dump(mode="json") for anchor in anchors],
    }
