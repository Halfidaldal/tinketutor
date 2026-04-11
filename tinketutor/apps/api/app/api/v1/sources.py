"""
SourceIngestion Endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.dependencies import get_current_user, get_storage
from app.domain.exceptions import SynthesisStudioError
from app.providers.base import AuthenticatedUser
from app.providers.object_store import ObjectStore
from app.infra.tasks import dispatch_source_processing
from app.services import source_service

router = APIRouter()


class SourceResponse(BaseModel):
    id: str
    user_id: str
    notebook_id: str
    title: str
    file_name: str
    mime_type: str
    file_type: str
    storage_path: str
    parser_type: str | None
    status: str
    processing_progress: int
    chunk_count: int
    error_message: str | None
    file_size_bytes: int
    last_job_id: str | None
    created_at: str
    updated_at: str
    processing_started_at: str | None
    processed_at: str | None


class SourceUploadResponse(BaseModel):
    source: SourceResponse
    jobId: str


class ChunkPositionResponse(BaseModel):
    page_start: int
    page_end: int
    section_title: str | None
    chapter_title: str | None
    paragraph_index: int
    char_start: int
    char_end: int


class ChunkMetadataResponse(BaseModel):
    language: str
    has_table: bool
    has_image: bool
    hierarchy_path: list[str]


class ChunkResponse(BaseModel):
    id: str
    notebook_id: str
    source_id: str
    user_id: str
    order_index: int
    content: str
    token_count: int
    embedding: list[float]
    position: ChunkPositionResponse
    metadata: ChunkMetadataResponse
    created_at: str


class ChunkListResponse(BaseModel):
    chunks: list[ChunkResponse]
    total: int


class JobResponse(BaseModel):
    id: str
    user_id: str
    notebook_id: str | None = None
    source_id: str | None = None
    type: str
    status: str
    target_id: str
    stage: str
    progress: int
    result: dict | None = None
    error_message: str | None = None
    created_at: str
    started_at: str | None = None
    updated_at: str
    completed_at: str | None = None


class SourceStatusResponse(BaseModel):
    source: SourceResponse
    job: JobResponse | None = None
    anchor_count: int


def _raise_from_domain_error(error: Exception) -> None:
    if isinstance(error, SynthesisStudioError):
        if error.code == "NOT_FOUND":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=error.message) from error
        if error.code == "FORBIDDEN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error.message) from error
        if error.code == "PROVIDER_ERROR":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    raise error


@router.post("", response_model=SourceUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_source(
    file: UploadFile = File(...),
    title: str = Form(""),
    notebook_id: str = Form(..., alias="notebookId"),
    user: AuthenticatedUser = Depends(get_current_user),
    object_store: ObjectStore = Depends(get_storage),
):
    filename = file.filename or "source.pdf"
    payload = await file.read()

    try:
        source_doc, job_doc = await source_service.create_source_upload(
            user_id=user.user_id,
            notebook_id=notebook_id,
            title=title or filename,
            file_name=filename,
            mime_type=file.content_type,
            file_bytes=payload,
            object_store=object_store,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    dispatch_source_processing(source_doc["id"], job_doc["id"])
    return {"source": source_doc, "jobId": job_doc["id"]}


@router.get("")
async def list_sources(
    notebookId: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    return {"sources": source_service.list_sources(notebookId, user.user_id)}


@router.get("/{source_id}")
async def get_source(
    source_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    source = source_service.get_source(source_id, user.user_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return {"source": source}


@router.get("/{source_id}/status", response_model=SourceStatusResponse)
async def get_source_status(
    source_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    payload = source_service.get_source_status(source_id, user.user_id)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return payload


@router.post("/{source_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_source(
    source_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        source_doc, job_doc = source_service.create_reprocess_job(source_id, user.user_id)
    except Exception as error:
        _raise_from_domain_error(error)

    dispatch_source_processing(source_doc["id"], job_doc["id"])
    return {"source": source_doc, "jobId": job_doc["id"]}


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    object_store: ObjectStore = Depends(get_storage),
):
    deleted = await source_service.delete_source(source_id, user.user_id, object_store)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return None


@router.get("/{source_id}/chunks", response_model=ChunkListResponse)
async def list_chunks(
    source_id: str,
    page: int = 1,
    limit: int = 20,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        chunks, total = source_service.list_source_chunks(
            source_id,
            user.user_id,
            page=page,
            limit=limit,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return {"chunks": chunks, "total": total}
