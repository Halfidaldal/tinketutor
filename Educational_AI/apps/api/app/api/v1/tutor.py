"""
ActiveLearning endpoints for the Phase 7 Socratic Tutor vertical slice.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.dependencies import get_current_user, get_embeddings, get_rerankers, get_vectors
from app.domain.enums import TutorEscalationAction, TutorSessionStatus
from app.domain.exceptions import SynthesisStudioError
from app.providers.base import AuthenticatedUser
from app.providers.embedding import EmbeddingProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.services.tutor_service import service as tutor_service

router = APIRouter()


class StartTutorSessionRequest(BaseModel):
    query: str | None = None
    focus_area: str | None = Field(default=None, alias="focusArea")
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")

    model_config = {"populate_by_name": True}

    def resolved_query(self) -> str:
        return (self.query or self.focus_area or "").strip()


class ContinueTutorRequest(BaseModel):
    content: str


class EscalateTutorRequest(BaseModel):
    action: TutorEscalationAction
    content: str | None = None


class TutorEvidenceItemResponse(BaseModel):
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


class TutorTurnResponse(BaseModel):
    id: str
    session_id: str
    notebook_id: str
    role: str
    message: str
    tutor_state: str
    message_type: str
    user_intent: str | None = None
    escalation_action: str | None = None
    citations: list[str]
    evidence_pack_id: str | None = None
    evidence_items: list[TutorEvidenceItemResponse]
    escalation_available: bool
    follow_up_required: bool
    suggested_next_action: str | None = None
    support_assessment: str | None = None
    insufficient_grounding: bool
    insufficiency_reason: str | None = None
    language: str
    created_at: str


class TutorSessionResponse(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    focus_area: str
    source_ids: list[str]
    status: str
    current_state: str
    message_count: int
    hint_level: int
    language: str
    last_user_message: str | None = None
    last_evidence_pack_id: str | None = None
    created_at: str
    updated_at: str


class TutorTurnEnvelope(BaseModel):
    session: TutorSessionResponse
    turn: TutorTurnResponse


class TutorSessionDetailEnvelope(BaseModel):
    session: TutorSessionResponse
    turns: list[TutorTurnResponse]


class TutorSessionListEnvelope(BaseModel):
    sessions: list[TutorSessionResponse]


class TutorTurnsEnvelope(BaseModel):
    turns: list[TutorTurnResponse]


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


def _serialize_session(session) -> dict[str, Any]:
    return {
        "id": session.id,
        "notebook_id": session.notebook_id,
        "user_id": session.user_id,
        "focus_area": session.focus_area,
        "source_ids": session.source_ids,
        "status": session.status.value,
        "current_state": session.current_state.value,
        "message_count": session.message_count,
        "hint_level": session.hint_level,
        "language": session.language.value,
        "last_user_message": session.last_user_message,
        "last_evidence_pack_id": session.last_evidence_pack_id,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
    }


def _serialize_turn(turn) -> dict[str, Any]:
    return {
        "id": turn.id,
        "session_id": turn.session_id,
        "notebook_id": turn.notebook_id,
        "role": turn.role.value,
        "message": turn.content,
        "tutor_state": turn.tutor_state.value,
        "message_type": turn.message_type.value,
        "user_intent": turn.user_intent.value if turn.user_intent else None,
        "escalation_action": turn.escalation_action.value if turn.escalation_action else None,
        "citations": turn.citation_ids,
        "evidence_pack_id": turn.evidence_pack_id,
        "evidence_items": [
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
            }
            for item in turn.evidence_items
        ],
        "escalation_available": turn.escalation_available,
        "follow_up_required": turn.follow_up_required,
        "suggested_next_action": turn.suggested_next_action,
        "support_assessment": turn.support_assessment.value if turn.support_assessment else None,
        "insufficient_grounding": turn.insufficient_grounding,
        "insufficiency_reason": turn.insufficiency_reason,
        "language": turn.language.value,
        "created_at": turn.created_at.isoformat(),
    }


@router.post("/{notebook_id}/tutor/sessions", status_code=status.HTTP_201_CREATED, response_model=TutorTurnEnvelope)
async def start_tutor_session(
    notebook_id: str,
    request: StartTutorSessionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    vector_store: VectorStore = Depends(get_vectors),
    embedding_provider: EmbeddingProvider = Depends(get_embeddings),
    reranker: Reranker = Depends(get_rerankers),
):
    try:
        session, turn = await tutor_service.start_session(
            notebook_id=notebook_id,
            user_id=user.user_id,
            query=request.resolved_query(),
            source_ids=request.source_ids,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "session": _serialize_session(session),
        "turn": _serialize_turn(turn),
    }


@router.get("/{notebook_id}/tutor/sessions", response_model=TutorSessionListEnvelope)
async def list_tutor_sessions(
    notebook_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    status_filter: str | None = Query(default=None, alias="status"),
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        status_value = None
        if status_filter:
            try:
                status_value = TutorSessionStatus(status_filter)
            except ValueError as error:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported tutor session status: {status_filter}",
                ) from error
        sessions = tutor_service.list_sessions(
            notebook_id=notebook_id,
            user_id=user.user_id,
            limit=limit,
            status=status_value,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {"sessions": [_serialize_session(session) for session in sessions]}


@router.get("/{notebook_id}/tutor/sessions/{session_id}", response_model=TutorSessionDetailEnvelope)
async def get_tutor_session(
    notebook_id: str,
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        session = tutor_service.get_session(
            notebook_id=notebook_id,
            session_id=session_id,
            user_id=user.user_id,
        )
        turns = tutor_service.list_turns(
            notebook_id=notebook_id,
            session_id=session_id,
            user_id=user.user_id,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "session": _serialize_session(session),
        "turns": [_serialize_turn(turn) for turn in turns],
    }


@router.get("/{notebook_id}/tutor/sessions/{session_id}/turns", response_model=TutorTurnsEnvelope)
async def list_tutor_turns(
    notebook_id: str,
    session_id: str,
    limit: int = Query(default=20, ge=1, le=50),
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        turns = tutor_service.list_turns(
            notebook_id=notebook_id,
            session_id=session_id,
            user_id=user.user_id,
            limit=limit,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {"turns": [_serialize_turn(turn) for turn in turns]}


@router.post("/{notebook_id}/tutor/sessions/{session_id}/turns", response_model=TutorTurnEnvelope)
@router.post("/{notebook_id}/tutor/sessions/{session_id}/messages", response_model=TutorTurnEnvelope)
async def continue_tutor_session(
    notebook_id: str,
    session_id: str,
    request: ContinueTutorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    vector_store: VectorStore = Depends(get_vectors),
    embedding_provider: EmbeddingProvider = Depends(get_embeddings),
    reranker: Reranker = Depends(get_rerankers),
):
    try:
        session, turn = await tutor_service.continue_session(
            notebook_id=notebook_id,
            session_id=session_id,
            user_id=user.user_id,
            content=request.content,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "session": _serialize_session(session),
        "turn": _serialize_turn(turn),
    }


@router.post("/{notebook_id}/tutor/sessions/{session_id}/escalate", response_model=TutorTurnEnvelope)
async def escalate_tutor_session(
    notebook_id: str,
    session_id: str,
    request: EscalateTutorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    vector_store: VectorStore = Depends(get_vectors),
    embedding_provider: EmbeddingProvider = Depends(get_embeddings),
    reranker: Reranker = Depends(get_rerankers),
):
    try:
        session, turn = await tutor_service.escalate_session(
            notebook_id=notebook_id,
            session_id=session_id,
            user_id=user.user_id,
            action=request.action,
            content=request.content,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {
        "session": _serialize_session(session),
        "turn": _serialize_turn(turn),
    }
