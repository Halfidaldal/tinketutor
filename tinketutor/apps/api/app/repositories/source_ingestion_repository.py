from __future__ import annotations

from app.domain.models import Chunk, CitationAnchor, ProcessingJob, Source
from app.infra.firestore import (
    jobs_collection,
    source_anchor_document,
    source_anchors_collection,
    source_chunk_document,
    source_chunks_collection,
    source_document,
    sources_collection,
    recursive_delete,
)
from app.repositories._firestore_utils import delete_collection, load_model, load_models, save_model


def create_source(source: Source) -> Source:
    return save_model(source_document(source.id), source)


def update_source(source: Source) -> Source:
    return save_model(source_document(source.id), source)


def get_source(source_id: str) -> Source | None:
    return load_model(source_document(source_id), Source)


def list_sources(notebook_id: str, user_id: str) -> list[Source]:
    query = (
        sources_collection()
        .where("notebook_id", "==", notebook_id)
        .where("user_id", "==", user_id)
    )
    sources = load_models(query.stream(), Source)
    sources.sort(key=lambda source: source.created_at, reverse=True)
    return sources


def delete_source(source_id: str) -> None:
    recursive_delete(source_document(source_id))
    delete_jobs_for_source(source_id)


def replace_chunks(source_id: str, chunks: list[Chunk]) -> None:
    delete_chunks_for_source(source_id)
    for chunk in chunks:
        save_model(source_chunk_document(source_id, chunk.id), chunk)


def list_chunks(source_id: str) -> list[Chunk]:
    chunks = load_models(source_chunks_collection(source_id).stream(), Chunk)
    chunks.sort(key=lambda chunk: chunk.order_index)
    return chunks


def delete_chunks_for_source(source_id: str) -> None:
    delete_collection(source_chunks_collection(source_id))


def replace_anchors(source_id: str, anchors: list[CitationAnchor]) -> None:
    delete_anchors_for_source(source_id)
    for anchor in anchors:
        save_model(source_anchor_document(source_id, anchor.id), anchor)


def list_anchors(source_id: str) -> list[CitationAnchor]:
    anchors = load_models(source_anchors_collection(source_id).stream(), CitationAnchor)
    anchors.sort(key=lambda anchor: anchor.order_index)
    return anchors


def delete_anchors_for_source(source_id: str) -> None:
    delete_collection(source_anchors_collection(source_id))


def create_job(job: ProcessingJob) -> ProcessingJob:
    save_model(jobs_collection().document(job.id), job)
    return job


def update_job(job: ProcessingJob) -> ProcessingJob:
    return save_model(jobs_collection().document(job.id), job)


def get_job(job_id: str) -> ProcessingJob | None:
    return load_model(jobs_collection().document(job_id), ProcessingJob)


def get_latest_job_for_source(source_id: str) -> ProcessingJob | None:
    query = jobs_collection().where("source_id", "==", source_id)
    jobs = load_models(query.stream(), ProcessingJob)
    jobs.sort(key=lambda job: job.created_at, reverse=True)
    return jobs[0] if jobs else None


def list_jobs_for_source(source_id: str) -> list[ProcessingJob]:
    query = jobs_collection().where("source_id", "==", source_id)
    jobs = load_models(query.stream(), ProcessingJob)
    jobs.sort(key=lambda job: job.created_at, reverse=True)
    return jobs


def delete_jobs_for_source(source_id: str) -> None:
    query = jobs_collection().where("source_id", "==", source_id)
    for snapshot in query.stream():
        snapshot.reference.delete()
