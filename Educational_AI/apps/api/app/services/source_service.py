"""
Source Service — upload orchestration, source metadata, and job lookup.

This service owns the synchronous parts of the SourceIngestion flow:
- validating the upload request
- storing the raw file through ObjectStore
- creating Source and SourceProcessingJob records
- exposing source, chunk, and status data to the API

The heavy parse/chunk/anchor pipeline runs through source_processing_service.py.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import mimetypes
import re

from app.domain.enums import FileType, JobStatus, JobType, SourceStatus
from app.domain.exceptions import (
    FileTooLargeError,
    NotebookSourceLimitError,
    NotFoundError,
    ProviderError,
    UnsupportedFileTypeError,
)
from app.domain.models import Chunk, ProcessingJob, Source, SourceProcessingJob
from app.infra.store import new_id, utc_now
from app.providers.object_store import ObjectStore
from app.repositories import source_ingestion_repository
from app.services.notebook_service import (
    add_source_to_notebook,
    get_notebook,
    remove_source_from_notebook,
)


ALLOWED_EXTENSIONS: dict[str, FileType] = {
    ".pdf": FileType.PDF,
    ".pptx": FileType.PPTX,
    ".docx": FileType.DOCX,
}

MAX_FILE_SIZE_MB = 50
MAX_SOURCES_PER_NOTEBOOK = 5


def _detect_file_type(filename: str) -> FileType | None:
    lower = filename.lower()
    for extension, file_type in ALLOWED_EXTENSIONS.items():
        if lower.endswith(extension):
            return file_type
    return None


def _safe_filename(filename: str) -> str:
    name = Path(filename).name
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-") or "source"


def _build_storage_path(user_id: str, notebook_id: str, source_id: str, file_name: str) -> str:
    return f"sources/{user_id}/{notebook_id}/{source_id}/{_safe_filename(file_name)}"


def _serialize_chunk(chunk: Chunk) -> dict:
    payload = chunk.model_dump(mode="json")
    payload["position"] = chunk.position.model_dump(mode="json")
    payload["metadata"] = chunk.metadata.model_dump(mode="json")
    return payload


def _paginate_chunks(chunks: list[Chunk], page: int, limit: int) -> tuple[list[dict], int]:
    total = len(chunks)
    start = max(page - 1, 0) * limit
    end = start + limit
    return [_serialize_chunk(chunk) for chunk in chunks[start:end]], total


async def create_source_upload(
    *,
    user_id: str,
    notebook_id: str,
    title: str,
    file_name: str,
    mime_type: str | None,
    file_bytes: bytes,
    object_store: ObjectStore,
) -> tuple[dict, dict]:
    notebook = get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    file_type = _detect_file_type(file_name)
    if file_type is None:
        raise UnsupportedFileTypeError(Path(file_name).suffix or file_name)

    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise FileTooLargeError(MAX_FILE_SIZE_MB)

    existing_sources = list_sources(notebook_id, user_id)
    if len(existing_sources) >= MAX_SOURCES_PER_NOTEBOOK:
        raise NotebookSourceLimitError(MAX_SOURCES_PER_NOTEBOOK)

    now = utc_now()
    source_id = new_id()
    try:
        storage_path = await object_store.upload(
            BytesIO(file_bytes),
            _build_storage_path(user_id, notebook_id, source_id, file_name),
        )
    except Exception as error:  # pragma: no cover - exercised in deployed environments
        raise ProviderError("storage", "Source upload failed") from error

    source = Source(
        id=source_id,
        user_id=user_id,
        notebook_id=notebook_id,
        title=title.strip() or Path(file_name).stem,
        file_name=file_name,
        mime_type=mime_type or mimetypes.guess_type(file_name)[0] or "application/octet-stream",
        file_type=file_type,
        storage_path=storage_path,
        parser_type=None,
        status=SourceStatus.UPLOADED,
        processing_progress=5,
        chunk_count=0,
        error_message=None,
        file_size_bytes=len(file_bytes),
        last_job_id=None,
        created_at=now,
        updated_at=now,
        processing_started_at=None,
        processed_at=None,
    )

    job = SourceProcessingJob(
        id=new_id(),
        user_id=user_id,
        notebook_id=notebook_id,
        source_id=source.id,
        target_id=source.id,
        status=JobStatus.QUEUED,
        stage="queued",
        progress=0,
        result=None,
        error_message=None,
        created_at=now,
        started_at=None,
        updated_at=now,
        completed_at=None,
    )

    source.last_job_id = job.id
    source_ingestion_repository.create_source(source)
    source_ingestion_repository.create_job(job)
    add_source_to_notebook(notebook_id, source.id)

    return source.model_dump(mode="json"), job.model_dump(mode="json")


def list_sources(notebook_id: str, user_id: str) -> list[dict]:
    return [
        source.model_dump(mode="json")
        for source in source_ingestion_repository.list_sources(notebook_id, user_id)
    ]


def get_source(source_id: str, user_id: str) -> dict | None:
    source = source_ingestion_repository.get_source(source_id)
    if not source or source.user_id != user_id:
        return None
    return source.model_dump(mode="json")


def get_source_model(source_id: str, user_id: str) -> Source | None:
    source = source_ingestion_repository.get_source(source_id)
    if not source or source.user_id != user_id:
        return None
    return source


async def delete_source(source_id: str, user_id: str, object_store: ObjectStore) -> bool:
    source = get_source_model(source_id, user_id)
    if not source:
        return False

    if source.storage_path:
        try:
            await object_store.delete(source.storage_path)
        except Exception as error:  # pragma: no cover - exercised in deployed environments
            raise ProviderError("storage", "Source deletion failed") from error

    source_ingestion_repository.delete_source(source_id)
    remove_source_from_notebook(source.notebook_id, source_id)
    return True


def list_source_chunks(
    source_id: str,
    user_id: str,
    *,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[dict], int]:
    source = get_source_model(source_id, user_id)
    if not source:
        raise NotFoundError("Source", source_id)

    chunks = source_ingestion_repository.list_chunks(source_id)
    return _paginate_chunks(chunks, page=max(page, 1), limit=max(limit, 1))


def get_source_status(source_id: str, user_id: str) -> dict | None:
    source = get_source_model(source_id, user_id)
    if not source:
        return None

    job = source_ingestion_repository.get_latest_job_for_source(source_id)
    anchors = source_ingestion_repository.list_anchors(source_id)
    return {
        "source": source.model_dump(mode="json"),
        "job": job.model_dump(mode="json") if job and job.user_id == user_id else None,
        "anchor_count": len(anchors),
    }


def get_job(job_id: str, user_id: str) -> ProcessingJob | None:
    job = source_ingestion_repository.get_job(job_id)
    if not job or job.user_id != user_id:
        return None
    return job


def get_job_payload(job_id: str, user_id: str) -> dict | None:
    job = get_job(job_id, user_id)
    return job.model_dump(mode="json") if job else None


def create_reprocess_job(source_id: str, user_id: str) -> tuple[dict, dict]:
    source = get_source_model(source_id, user_id)
    if not source:
        raise NotFoundError("Source", source_id)

    now = utc_now()
    job = SourceProcessingJob(
        id=new_id(),
        user_id=user_id,
        notebook_id=source.notebook_id,
        source_id=source.id,
        target_id=source.id,
        status=JobStatus.QUEUED,
        stage="queued",
        progress=0,
        result=None,
        error_message=None,
        created_at=now,
        started_at=None,
        updated_at=now,
        completed_at=None,
    )

    source.status = SourceStatus.UPLOADED
    source.processing_progress = 5
    source.chunk_count = 0
    source.error_message = None
    source.last_job_id = job.id
    source.updated_at = now
    source.processing_started_at = None
    source.processed_at = None

    source_ingestion_repository.replace_chunks(source_id, [])
    source_ingestion_repository.replace_anchors(source_id, [])
    source_ingestion_repository.update_source(source)
    source_ingestion_repository.create_job(job)

    return source.model_dump(mode="json"), job.model_dump(mode="json")
