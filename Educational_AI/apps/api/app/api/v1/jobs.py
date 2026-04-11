"""Jobs Endpoint — Processing Job Status."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.providers.base import AuthenticatedUser
from app.services import source_service

router = APIRouter()


@router.get("/{job_id}")
async def get_job_status(
    job_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Get the status of a processing job.
    Job lifecycle: queued → running → completed | failed
    """
    job = source_service.get_job_payload(job_id, user.user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return {"job": job}
