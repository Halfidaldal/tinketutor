"""
ActiveLearning Endpoints — Quiz / Flashcards

Bounded context: ActiveLearning
Owns: QuizItem, QuizAttempt

Endpoints (phase-2-system-contracts.md §ActiveLearning — Quiz):
- POST /notebooks/:id/quizzes/generate — Generate quiz items (async)
- GET /notebooks/:id/quizzes — List quiz items
- POST /notebooks/:id/quizzes/:qid/submit — Submit quiz answer
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.providers.base import AuthenticatedUser
from app.services import notebook_service, quiz_service
from app.repositories import quiz_repository

router = APIRouter()


def _ensure_owned_notebook(notebook_id: str, user_id: str) -> None:
    if not notebook_service.get_notebook(notebook_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found")


class GenerateQuizRequest(BaseModel):
    sourceIds: list[str] = []
    count: int = 5
    difficulty: str | None = None  # recall | understanding | application
    topic: str | None = None


class SubmitQuizAnswerRequest(BaseModel):
    userAnswer: str


@router.post("/{notebook_id}/quizzes/generate")
async def generate_quiz(
    notebook_id: str,
    request: GenerateQuizRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_owned_notebook(notebook_id, user.user_id)
    job = quiz_service.create_quiz_generation_job(
        user_id=user.user_id,
        notebook_id=notebook_id,
        source_ids=request.sourceIds,
        count=request.count,
        difficulty=request.difficulty,
        topic=request.topic,
    )
    return {"jobId": job.id}


@router.get("/{notebook_id}/quizzes")
async def list_quiz_items(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_owned_notebook(notebook_id, user.user_id)
    items = quiz_repository.list_quiz_items_for_notebook(notebook_id)
    return {"quizItems": [item.model_dump(mode="json") for item in items]}


@router.post("/{notebook_id}/quizzes/{quiz_item_id}/submit")
async def submit_quiz_answer(
    notebook_id: str,
    quiz_item_id: str,
    request: SubmitQuizAnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    _ensure_owned_notebook(notebook_id, user.user_id)
    try:
        result = await quiz_service.submit_quiz_answer(
            user_id=user.user_id,
            notebook_id=notebook_id,
            quiz_item_id=quiz_item_id,
            user_answer=request.userAnswer,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
