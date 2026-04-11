"""
Quiz Repository

Owns QuizItem and QuizAttempt persistence.
"""
from __future__ import annotations

from app.domain.models import QuizItem, QuizAttempt
from app.infra.firestore import (
    notebook_quiz_attempt_document,
    notebook_quiz_attempts_collection,
    notebook_quiz_item_document,
    notebook_quiz_items_collection,
)
from app.repositories._firestore_utils import collection_group_first_model, load_models, save_model


def create_quiz_item(quiz_item: QuizItem) -> QuizItem:
    return save_model(
        notebook_quiz_item_document(quiz_item.notebook_id, quiz_item.id),
        quiz_item,
    )

def list_quiz_items_for_notebook(notebook_id: str) -> list[QuizItem]:
    items = load_models(notebook_quiz_items_collection(notebook_id).stream(), QuizItem)
    items.sort(key=lambda item: item.created_at)
    return items

def get_quiz_item(quiz_item_id: str) -> QuizItem | None:
    return collection_group_first_model("quizItems", QuizItem, id=quiz_item_id)

def create_quiz_attempt(attempt: QuizAttempt) -> QuizAttempt:
    return save_model(
        notebook_quiz_attempt_document(attempt.notebook_id, attempt.id),
        attempt,
    )

def list_quiz_attempts_for_user(user_id: str, notebook_id: str) -> list[QuizAttempt]:
    query = notebook_quiz_attempts_collection(notebook_id).where("user_id", "==", user_id)
    attempts = load_models(query.stream(), QuizAttempt)
    attempts.sort(key=lambda attempt: attempt.created_at)
    return attempts
