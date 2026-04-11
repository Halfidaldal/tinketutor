"""
KnowledgeRetrieval endpoints for search, evidence packs, and citation resolution.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import get_current_user, get_embeddings, get_rerankers, get_vectors
from app.domain.exceptions import SynthesisStudioError
from app.providers.base import AuthenticatedUser
from app.providers.embedding import EmbeddingProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.services import citation_service, search_service

router = APIRouter()


class SearchRequest(BaseModel):
    notebook_id: str = Field(alias="notebookId")
    query: str
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    top_k: int = Field(default=10, alias="topK", ge=1, le=20)

    model_config = {"populate_by_name": True}


class EvidenceItemResponse(BaseModel):
    source_id: str
    source_title: str
    chunk_id: str
    citation_ids: list[str]
    citation_anchor_ids: list[str]
    snippet_text: str
    page_start: int
    page_end: int
    section_title: str | None = None
    rank: int
    score: float
    support: str
    keyword_score: float
    vector_score: float


class EvidencePackResponse(BaseModel):
    id: str
    notebook_id: str
    query: str
    retrieval_mode: str
    source_ids: list[str]
    top_evidence: list[EvidenceItemResponse]
    support_assessment: str
    answerable_from_notebook: bool
    insufficient_grounding: bool
    insufficiency_reason: str | None = None
    generated_at: str | None = None
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class EvidencePackEnvelope(BaseModel):
    evidence_pack: EvidencePackResponse


class RetrievalReadinessResponse(BaseModel):
    notebook_id: str
    total_source_count: int
    ready_source_count: int
    chunk_count: int
    traceable_chunk_count: int
    citation_anchor_count: int
    retrieval_ready: bool
    blocking_reasons: list[str]


class SourceSummaryResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    file_name: str
    status: str


class ChunkPositionResponse(BaseModel):
    page_start: int
    page_end: int
    section_title: str | None = None
    chapter_title: str | None = None
    paragraph_index: int
    char_start: int
    char_end: int


class ChunkMetadataResponse(BaseModel):
    language: str
    has_table: bool
    has_image: bool
    hierarchy_path: list[str]


class ChunkDocumentResponse(BaseModel):
    id: str
    notebook_id: str
    source_id: str
    user_id: str
    order_index: int
    content: str
    token_count: int
    position: ChunkPositionResponse
    metadata: ChunkMetadataResponse
    created_at: str


class CitationAnchorResponse(BaseModel):
    id: str
    notebook_id: str
    source_id: str
    chunk_id: str
    source_title: str
    parser_type: str | None = None
    page_start: int
    page_end: int
    section_title: str | None = None
    char_start: int
    char_end: int
    snippet_text: str
    order_index: int
    created_at: str


class CitationResponse(BaseModel):
    id: str
    notebook_id: str
    output_type: str
    output_id: str
    chunk_id: str
    source_id: str
    source_title: str
    page_start: int
    page_end: int
    section_title: str | None = None
    relevance_score: float
    created_at: str


class CitationResolutionResponse(BaseModel):
    citation: CitationResponse
    chunk: ChunkDocumentResponse
    source: SourceSummaryResponse
    citation_anchors: list[CitationAnchorResponse]


class CitationAnchorResolutionResponse(BaseModel):
    citation_anchor: CitationAnchorResponse
    chunk: ChunkDocumentResponse
    source: SourceSummaryResponse


class ChunkResolutionResponse(BaseModel):
    chunk: ChunkDocumentResponse
    source: SourceSummaryResponse
    citation_anchors: list[CitationAnchorResponse]


def _raise_from_domain_error(error: Exception) -> None:
    if isinstance(error, SynthesisStudioError):
        if error.code == "NOT_FOUND":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=error.message) from error
        if error.code == "FORBIDDEN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error.message) from error
        if error.code == "PROVIDER_ERROR":
            status_code = (
                status.HTTP_503_SERVICE_UNAVAILABLE
                if "index is still building" in error.message.casefold()
                else status.HTTP_502_BAD_GATEWAY
            )
            raise HTTPException(status_code=status_code, detail=error.message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    raise error


def _serialize_pack(pack) -> dict[str, Any]:
    return {
        "id": pack.id,
        "notebook_id": pack.notebook_id,
        "query": pack.query,
        "retrieval_mode": pack.retrieval_mode.value,
        "source_ids": pack.source_ids,
        "top_evidence": [
            {
                "source_id": item.source_id,
                "source_title": item.source_title,
                "chunk_id": item.chunk_id,
                "citation_ids": item.citation_ids,
                "citation_anchor_ids": item.citation_anchor_ids,
                "snippet_text": item.snippet_text,
                "page_start": item.page_start,
                "page_end": item.page_end,
                "section_title": item.section_title,
                "rank": item.rank,
                "score": item.score,
                "support": item.support.value,
                "keyword_score": item.keyword_score,
                "vector_score": item.vector_score,
            }
            for item in pack.chunks
        ],
        "support_assessment": pack.support_assessment.value,
        "answerable_from_notebook": not pack.insufficient_grounding,
        "insufficient_grounding": pack.insufficient_grounding,
        "insufficiency_reason": pack.insufficiency_reason,
        "generated_at": pack.generated_at.isoformat() if pack.generated_at else None,
        "diagnostics": pack.diagnostics,
    }


@router.post("/search", response_model=EvidencePackEnvelope)
@router.post("/evidence-packs", response_model=EvidencePackEnvelope)
async def search_notebook(
    request: SearchRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    vector_store: VectorStore = Depends(get_vectors),
    embedding_provider: EmbeddingProvider = Depends(get_embeddings),
    reranker: Reranker = Depends(get_rerankers),
):
    try:
        evidence_pack = await search_service.build_evidence_pack(
            notebook_id=request.notebook_id,
            user_id=user.user_id,
            query=request.query,
            requested_source_ids=request.source_ids,
            top_k=request.top_k,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {"evidence_pack": _serialize_pack(evidence_pack)}


@router.get("/notebooks/{notebook_id}/retrieval-readiness", response_model=RetrievalReadinessResponse)
async def get_retrieval_readiness(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        readiness = await search_service.get_retrieval_readiness(notebook_id, user.user_id)
    except Exception as error:
        _raise_from_domain_error(error)
    return readiness


@router.get("/citations/{citation_id}", response_model=CitationResolutionResponse)
async def get_citation(
    citation_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    payload = citation_service.resolve_citation(citation_id, user.user_id)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citation not found")
    return payload


@router.get("/citation-anchors/{anchor_id}", response_model=CitationAnchorResolutionResponse)
async def get_citation_anchor(
    anchor_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    payload = citation_service.resolve_citation_anchor(anchor_id, user.user_id)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citation anchor not found")
    return payload


@router.get("/chunks/{chunk_id}", response_model=ChunkResolutionResponse)
async def get_chunk(
    chunk_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    payload = citation_service.resolve_chunk(chunk_id, user.user_id)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chunk not found")
    return payload
