"""
ActiveLearning Endpoints — Gap Hunter

Bounded context: ActiveLearning
Owns: KnowledgeGap

Endpoints (phase-2-system-contracts.md §ActiveLearning — Gap Hunter):
- POST /notebooks/:id/gaps/analyze — Trigger gap analysis (async)
- GET /notebooks/:id/gaps — List identified gaps
"""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.providers.base import AuthenticatedUser
from app.services import gap_service, notebook_service
from app.repositories import gap_repository

router = APIRouter()


def _ensure_owned_notebook(notebook_id: str, user_id: str) -> None:
    if not notebook_service.get_notebook(notebook_id, user_id):
        raise HTTPException(status_code=404, detail="Notebook not found")


@router.post("/{notebook_id}/gaps/analyze")
async def analyze_gaps(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Trigger knowledge gap analysis (async).
    """
    _ensure_owned_notebook(notebook_id, user.user_id)
    job_id = gap_service.create_gap_analysis_job(notebook_id, user.user_id)
    from app.infra.tasks import dispatch_gap_analysis
    dispatch_gap_analysis(job_id, notebook_id, user.user_id)
    return {"jobId": job_id}


@router.get("/{notebook_id}/gaps")
async def list_gaps(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    List identified knowledge gaps for a notebook.
    For this deterministic implementation, we fetch the latest report and findings.
    """
    _ensure_owned_notebook(notebook_id, user.user_id)
    report = gap_repository.get_latest_gap_report_for_notebook(notebook_id)
    if not report or report.user_id != user.user_id:
        return {"report": None, "findings": []}

    findings = gap_repository.list_gap_findings_for_report(report.id)
    return {
        "report": report.model_dump(mode="json"),
        "findings": [f.model_dump(mode="json") for f in findings]
    }
