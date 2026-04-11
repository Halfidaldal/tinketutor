from __future__ import annotations

from datetime import UTC, datetime

from app.domain.enums import (
    EvidenceSupport,
    Language,
    SupportAssessment,
    TutorMessageType,
    TutorMode,
    TutorSessionStatus,
    TutorState,
    TutorUserIntent,
)
from app.domain.models import EvidenceChunk, EvidencePack, TutorSession
from app.services.tutor_service import _build_retrieval_query, _build_tutor_turn_draft


def _make_session() -> TutorSession:
    now = datetime.now(UTC)
    return TutorSession(
        id="session-1",
        notebook_id="nb-1",
        user_id="user-1",
        focus_area="What are the main results of asymmetry?",
        source_ids=["source-1"],
        status=TutorSessionStatus.ACTIVE,
        current_mode=TutorMode.STUDYING,
        current_state=TutorState.IDLE,
        message_count=1,
        hint_level=0,
        language=Language.EN,
        last_user_message="What are the main results of asymmetry?",
        created_at=now,
        updated_at=now,
    )


def test_build_retrieval_query_adds_session_context_for_short_follow_ups() -> None:
    session = _make_session()

    retrieval_query = _build_retrieval_query(
        session=session,
        query="Who is he?",
        is_new_session=False,
    )

    assert "Focus topic: What are the main results of asymmetry?" in retrieval_query
    assert "Previous question: What are the main results of asymmetry?" in retrieval_query
    assert "Follow-up question: Who is he?" in retrieval_query


def test_weak_evidence_no_longer_forces_insufficient_grounding() -> None:
    session = _make_session()
    evidence_pack = EvidencePack(
        id="ev-1",
        query="Who is he?",
        notebook_id="nb-1",
        chunks=[
            EvidenceChunk(
                chunk_id="chunk-1",
                source_id="source-1",
                source_title="Notebook Source",
                content="The author describes the asymmetry result in the introduction.",
                snippet_text="The author describes the asymmetry result in the introduction.",
                page_start=1,
                page_end=1,
                section_title="Introduction",
                score=0.42,
                rank=1,
                support=EvidenceSupport.WEAK,
            )
        ],
        source_ids=["source-1"],
        support_assessment=SupportAssessment.WEAK_EVIDENCE,
        insufficient_grounding=False,
        insufficiency_reason="Only weak evidence was found for this query.",
    )

    draft = _build_tutor_turn_draft(
        session=session,
        query="Who is he?",
        user_intent=TutorUserIntent.UNDERSTAND_TOPIC,
        evidence_pack=evidence_pack,
        language=Language.EN,
        is_new_session=False,
    )

    assert draft.tutor_state == TutorState.HINT_LEVEL_1
    assert draft.message_type == TutorMessageType.QUESTION
    assert draft.insufficient_grounding is False
    assert draft.evidence_items
