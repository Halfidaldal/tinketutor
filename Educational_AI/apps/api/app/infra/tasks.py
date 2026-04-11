"""
In-process task dispatch for development.

This is the explicit async seam that can be replaced with Cloud Tasks later.
"""

from __future__ import annotations

import asyncio
from threading import Thread

from app.providers.factory import get_object_store, get_parser_provider, get_vector_store, get_embedding_provider
from app.services import source_processing_service


def dispatch_source_processing(source_id: str, job_id: str) -> None:
    worker = Thread(
        target=_run_source_processing_sync,
        args=(source_id, job_id),
        daemon=True,
    )
    worker.start()


def _run_source_processing_sync(source_id: str, job_id: str) -> None:
    asyncio.run(_run_source_processing(source_id, job_id))


async def _run_source_processing(source_id: str, job_id: str) -> None:
    parser = get_parser_provider()
    object_store = get_object_store()
    vector_store = get_vector_store()
    embedding_provider = get_embedding_provider()
    await source_processing_service.process_source(
        source_id=source_id,
        job_id=job_id,
        parser=parser,
        object_store=object_store,
        vector_store=vector_store,
        embedding_provider=embedding_provider,
    )

def dispatch_quiz_generation(
    notebook_id: str,
    job_id: str,
    source_ids: list[str],
    count: int,
    difficulty: str | None,
    topic: str | None,
) -> None:
    worker = Thread(
        target=_run_quiz_generation_sync,
        args=(notebook_id, job_id, source_ids, count, difficulty, topic),
        daemon=True,
    )
    worker.start()


async def _async_gap_analysis(job_id: str, notebook_id: str, user_id: str):
    try:
        from app.services import gap_service
        await gap_service.run_gap_analysis(notebook_id, user_id, job_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        from app.domain.enums import JobStatus
        from app.infra.store import utc_now
        from app.repositories import source_ingestion_repository

        job = source_ingestion_repository.get_job(job_id)
        if job:
            failed_at = utc_now()
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.updated_at = failed_at
            job.completed_at = failed_at
            source_ingestion_repository.update_job(job)


def dispatch_gap_analysis(job_id: str, notebook_id: str, user_id: str):
    """
    Fire-and-forget task to run a gap analysis based on user notebook signals.
    """
    def _run_gaps():
        print(f"[BACKGROUND] Starting gap analysis job {job_id} for notebook {notebook_id}")
        asyncio.run(_async_gap_analysis(job_id, notebook_id, user_id))

    thread = Thread(target=_run_gaps)
    thread.daemon = True
    thread.start()

def _run_quiz_generation_sync(
    notebook_id: str,
    job_id: str,
    source_ids: list[str],
    count: int,
    difficulty: str | None,
    topic: str | None,
) -> None:
    asyncio.run(_run_quiz_generation(notebook_id, job_id, source_ids, count, difficulty, topic))

async def _run_quiz_generation(
    notebook_id: str,
    job_id: str,
    source_ids: list[str],
    count: int,
    difficulty: str | None,
    topic: str | None,
) -> None:
    from app.services import quiz_service
    await quiz_service._process_quiz_generation(
        notebook_id=notebook_id,
        job_id=job_id,
        source_ids=source_ids,
        count=count,
        difficulty=difficulty,
        topic=topic,
    )
