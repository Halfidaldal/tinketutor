from __future__ import annotations

from app.domain.enums import TutorMessageRole, TutorSessionStatus
from app.domain.models import TutorSession, TutorTurn
from app.infra.firestore import (
    notebook_tutor_session_document,
    notebook_tutor_sessions_collection,
    tutor_session_turn_document,
    tutor_session_turns_collection,
)
from app.repositories._firestore_utils import (
    collection_group_first_model,
    load_models,
    save_model,
)


def create_session(session: TutorSession) -> TutorSession:
    return save_model(notebook_tutor_session_document(session.notebook_id, session.id), session)


def get_session(session_id: str) -> TutorSession | None:
    return collection_group_first_model("tutorSessions", TutorSession, id=session_id)


def update_session(session: TutorSession) -> TutorSession:
    return save_model(notebook_tutor_session_document(session.notebook_id, session.id), session)


def list_sessions_for_notebook(
    notebook_id: str,
    user_id: str,
    *,
    limit: int | None = None,
    status: TutorSessionStatus | None = None,
) -> list[TutorSession]:
    query = (
        notebook_tutor_sessions_collection(notebook_id)
        .where("user_id", "==", user_id)
    )
    sessions = load_models(query.stream(), TutorSession)
    if status is not None:
        sessions = [session for session in sessions if session.status == status]
    sessions.sort(key=lambda session: session.updated_at, reverse=True)
    if limit is not None:
        return sessions[:limit]
    return sessions


def create_turn(turn: TutorTurn) -> TutorTurn:
    session = get_session(turn.session_id)
    if not session:
        raise ValueError(f"Unknown tutor session: {turn.session_id}")
    return save_model(
        tutor_session_turn_document(session.notebook_id, turn.session_id, turn.id),
        turn,
    )


def list_turns_for_session(session_id: str, *, limit: int | None = None) -> list[TutorTurn]:
    session = get_session(session_id)
    if not session:
        return []

    turns = load_models(
        tutor_session_turns_collection(session.notebook_id, session_id).stream(),
        TutorTurn,
    )
    turns.sort(key=lambda turn: turn.created_at)
    if limit is not None and limit > 0:
        return turns[-limit:]
    return turns


def get_last_student_turn(session_id: str) -> TutorTurn | None:
    turns = list_turns_for_session(session_id)
    for turn in reversed(turns):
        if turn.role == TutorMessageRole.STUDENT:
            return turn
    return None
