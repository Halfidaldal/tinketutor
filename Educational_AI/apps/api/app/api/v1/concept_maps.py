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
from app.services import canvas_service


router = APIRouter()


class GenerateConceptMapRequest(BaseModel):
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")

    model_config = {"populate_by_name": True}


class ConceptEvidenceResponse(BaseModel):
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


class ConceptNodeResponse(BaseModel):
    id: str
    notebook_id: str
    concept_map_id: str
    stable_key: str
    label: str
    summary: str
    note: str
    guiding_question: str | None = None
    status: str
    support: str
    uncertain: bool
    needs_refinement: bool
    citation_ids: list[str]
    citation_anchor_ids: list[str]
    evidence_items: list[ConceptEvidenceResponse]
    source_ids: list[str]
    source_coverage_count: int
    editable: bool
    created_by: str
    position_x: float
    position_y: float
    created_at: str
    updated_at: str


class ConceptEdgeResponse(BaseModel):
    id: str
    notebook_id: str
    concept_map_id: str
    stable_key: str
    source_node_id: str
    target_node_id: str
    label: str
    summary: str
    support: str
    uncertain: bool
    needs_refinement: bool
    citation_ids: list[str]
    citation_anchor_ids: list[str]
    evidence_items: list[ConceptEvidenceResponse]
    source_ids: list[str]
    source_coverage_count: int
    editable: bool
    created_by: str
    created_at: str
    updated_at: str


class ConceptMapResponse(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    title: str
    source_ids: list[str]
    generation_status: str
    generation_strategy: str
    support_assessment: str
    insufficient_grounding: bool
    insufficiency_reason: str | None = None
    diagnostics: dict[str, Any]
    node_ids: list[str]
    edge_ids: list[str]
    created_at: str
    updated_at: str
    generated_at: str | None = None


class ConceptMapEnvelope(BaseModel):
    concept_map: ConceptMapResponse
    nodes: list[ConceptNodeResponse]
    edges: list[ConceptEdgeResponse]


class ConceptNodeEnvelope(BaseModel):
    node: ConceptNodeResponse


class ConceptEdgeEnvelope(BaseModel):
    edge: ConceptEdgeResponse


class UpdateConceptNodeRequest(BaseModel):
    label: str | None = None
    summary: str | None = None
    note: str | None = None
    position_x: float | None = Field(default=None, alias="positionX")
    position_y: float | None = Field(default=None, alias="positionY")

    model_config = {"populate_by_name": True}


class UpdateConceptEdgeRequest(BaseModel):
    label: str | None = None
    summary: str | None = None


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


def _serialize_reference(reference) -> dict[str, Any]:
    return {
        "source_id": reference.source_id,
        "source_title": reference.source_title,
        "chunk_id": reference.chunk_id,
        "citation_ids": reference.citation_ids,
        "citation_anchor_ids": reference.citation_anchor_ids,
        "snippet_text": reference.snippet_text,
        "page_start": reference.page_start,
        "page_end": reference.page_end,
        "section_title": reference.section_title,
        "rank": reference.rank,
        "score": reference.score,
        "support": reference.support.value,
    }


def _serialize_node(node) -> dict[str, Any]:
    return {
        "id": node.id,
        "notebook_id": node.notebook_id,
        "concept_map_id": node.concept_map_id,
        "stable_key": node.stable_key,
        "label": node.label,
        "summary": node.summary,
        "note": node.note,
        "guiding_question": node.guiding_question,
        "status": node.status.value,
        "support": node.support.value,
        "uncertain": node.uncertain,
        "needs_refinement": node.needs_refinement,
        "citation_ids": node.citation_ids,
        "citation_anchor_ids": node.citation_anchor_ids,
        "evidence_items": [_serialize_reference(reference) for reference in node.evidence_items],
        "source_ids": node.source_ids,
        "source_coverage_count": node.source_coverage_count,
        "editable": node.editable,
        "created_by": node.created_by.value,
        "position_x": node.position_x,
        "position_y": node.position_y,
        "created_at": node.created_at.isoformat(),
        "updated_at": node.updated_at.isoformat(),
    }


def _serialize_edge(edge) -> dict[str, Any]:
    return {
        "id": edge.id,
        "notebook_id": edge.notebook_id,
        "concept_map_id": edge.concept_map_id,
        "stable_key": edge.stable_key,
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "label": edge.label,
        "summary": edge.summary,
        "support": edge.support.value,
        "uncertain": edge.uncertain,
        "needs_refinement": edge.needs_refinement,
        "citation_ids": edge.citation_ids,
        "citation_anchor_ids": edge.citation_anchor_ids,
        "evidence_items": [_serialize_reference(reference) for reference in edge.evidence_items],
        "source_ids": edge.source_ids,
        "source_coverage_count": edge.source_coverage_count,
        "editable": edge.editable,
        "created_by": edge.created_by.value,
        "created_at": edge.created_at.isoformat(),
        "updated_at": edge.updated_at.isoformat(),
    }


def _serialize_map(concept_map) -> dict[str, Any]:
    return {
        "id": concept_map.id,
        "notebook_id": concept_map.notebook_id,
        "user_id": concept_map.user_id,
        "title": concept_map.title,
        "source_ids": concept_map.source_ids,
        "generation_status": concept_map.generation_status.value,
        "generation_strategy": concept_map.generation_strategy,
        "support_assessment": concept_map.support_assessment.value,
        "insufficient_grounding": concept_map.insufficient_grounding,
        "insufficiency_reason": concept_map.insufficiency_reason,
        "diagnostics": concept_map.diagnostics,
        "node_ids": concept_map.node_ids,
        "edge_ids": concept_map.edge_ids,
        "created_at": concept_map.created_at.isoformat(),
        "updated_at": concept_map.updated_at.isoformat(),
        "generated_at": concept_map.generated_at.isoformat() if concept_map.generated_at else None,
    }


@router.post("/{notebook_id}/concept-maps", response_model=ConceptMapEnvelope, status_code=status.HTTP_201_CREATED)
@router.post("/{notebook_id}/generate-canvas", response_model=ConceptMapEnvelope)
async def generate_concept_map(
    notebook_id: str,
    request: GenerateConceptMapRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    vector_store: VectorStore = Depends(get_vectors),
    embedding_provider: EmbeddingProvider = Depends(get_embeddings),
    reranker: Reranker = Depends(get_rerankers),
):
    try:
        concept_map, nodes, edges = await canvas_service.generate_concept_map(
            notebook_id=notebook_id,
            user_id=user.user_id,
            source_ids=request.source_ids,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "concept_map": _serialize_map(concept_map),
        "nodes": [_serialize_node(node) for node in nodes],
        "edges": [_serialize_edge(edge) for edge in edges],
    }


@router.get("/{notebook_id}/concept-maps/latest", response_model=ConceptMapEnvelope)
async def get_latest_concept_map(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        concept_map, nodes, edges = canvas_service.get_latest_concept_map(
            notebook_id=notebook_id,
            user_id=user.user_id,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    if concept_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concept map not found")

    return {
        "concept_map": _serialize_map(concept_map),
        "nodes": [_serialize_node(node) for node in nodes],
        "edges": [_serialize_edge(edge) for edge in edges],
    }


@router.get("/{notebook_id}/concept-maps/{concept_map_id}", response_model=ConceptMapEnvelope)
async def get_concept_map(
    notebook_id: str,
    concept_map_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        concept_map, nodes, edges = canvas_service.get_concept_map(
            notebook_id=notebook_id,
            user_id=user.user_id,
            concept_map_id=concept_map_id,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "concept_map": _serialize_map(concept_map),
        "nodes": [_serialize_node(node) for node in nodes],
        "edges": [_serialize_edge(edge) for edge in edges],
    }


@router.get("/{notebook_id}/concept-maps/{concept_map_id}/nodes/{node_id}", response_model=ConceptNodeEnvelope)
async def inspect_concept_node(
    notebook_id: str,
    concept_map_id: str,
    node_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        node = canvas_service.inspect_concept_node(
            notebook_id=notebook_id,
            user_id=user.user_id,
            concept_map_id=concept_map_id,
            node_id=node_id,
        )
    except Exception as error:
        _raise_from_domain_error(error)
    return {"node": _serialize_node(node)}


@router.put("/{notebook_id}/concept-maps/{concept_map_id}/nodes/{node_id}", response_model=ConceptNodeEnvelope)
async def update_concept_node(
    notebook_id: str,
    concept_map_id: str,
    node_id: str,
    request: UpdateConceptNodeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        node = canvas_service.update_concept_node(
            notebook_id=notebook_id,
            user_id=user.user_id,
            concept_map_id=concept_map_id,
            node_id=node_id,
            label=request.label,
            summary=request.summary,
            note=request.note,
            position_x=request.position_x,
            position_y=request.position_y,
        )
    except Exception as error:
        _raise_from_domain_error(error)
    return {"node": _serialize_node(node)}


@router.get("/{notebook_id}/concept-maps/{concept_map_id}/edges/{edge_id}", response_model=ConceptEdgeEnvelope)
async def inspect_concept_edge(
    notebook_id: str,
    concept_map_id: str,
    edge_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        edge = canvas_service.inspect_concept_edge(
            notebook_id=notebook_id,
            user_id=user.user_id,
            concept_map_id=concept_map_id,
            edge_id=edge_id,
        )
    except Exception as error:
        _raise_from_domain_error(error)
    return {"edge": _serialize_edge(edge)}


@router.put("/{notebook_id}/concept-maps/{concept_map_id}/edges/{edge_id}", response_model=ConceptEdgeEnvelope)
async def update_concept_edge(
    notebook_id: str,
    concept_map_id: str,
    edge_id: str,
    request: UpdateConceptEdgeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        edge = canvas_service.update_concept_edge(
            notebook_id=notebook_id,
            user_id=user.user_id,
            concept_map_id=concept_map_id,
            edge_id=edge_id,
            label=request.label,
            summary=request.summary,
        )
    except Exception as error:
        _raise_from_domain_error(error)
    return {"edge": _serialize_edge(edge)}
