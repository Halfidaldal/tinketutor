"""
Background source-processing pipeline.

Stage order:
1. file materialization
2. parse
3. deterministic chunking
4. citation-anchor skeleton creation
5. source/job terminal state update
"""

from __future__ import annotations

from pathlib import Path
import tempfile

from app.domain.enums import JobStatus, SourceStatus
from app.domain.exceptions import ProviderError
from app.domain.models import Source
from app.infra.store import utc_now
from app.config import settings
from app.providers.object_store import ObjectStore
from app.providers.parser import ParserProvider
from app.providers.vector_store import VectorStore
from app.providers.embedding import EmbeddingProvider
from app.domain.models import ChunkWithEmbedding
from app.repositories import source_ingestion_repository
from app.services import chunking_service, citation_anchor_service


async def _materialize_file(source: Source, object_store: ObjectStore) -> str:
    source_path = Path(source.storage_path)
    if source_path.exists():
        return str(source_path)

    payload = await object_store.download(source.storage_path)
    suffix = Path(source.file_name).suffix or f".{source.file_type.value}"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(payload)
        return handle.name


async def process_source(
    *,
    source_id: str,
    job_id: str,
    parser: ParserProvider,
    object_store: ObjectStore,
    vector_store: VectorStore,
    embedding_provider: EmbeddingProvider,
) -> None:
    source = source_ingestion_repository.get_source(source_id)
    job = source_ingestion_repository.get_job(job_id)
    if not source or not job:
        return

    start_time = utc_now()
    source.status = SourceStatus.PROCESSING
    source.processing_progress = 15
    source.processing_started_at = start_time
    source.error_message = None
    source.updated_at = start_time
    source_ingestion_repository.update_source(source)

    job.status = JobStatus.RUNNING
    job.stage = "parsing"
    job.progress = 20
    job.started_at = start_time
    job.updated_at = start_time
    job.error_message = None
    source_ingestion_repository.update_job(job)

    try:
        file_path = await _materialize_file(source, object_store)
        parsed_document = await parser.parse(file_path, source.file_type.value)

        source.parser_type = str(parsed_document.metadata.get("parser_type") or parser.__class__.__name__)
        source.processing_progress = 45
        source.updated_at = utc_now()
        source_ingestion_repository.update_source(source)

        job.stage = "chunking"
        job.progress = 55
        job.updated_at = utc_now()
        source_ingestion_repository.update_job(job)

        chunks = chunking_service.build_chunks(source, parsed_document)
        if not chunks:
            raise ProviderError("parser", "No readable text could be chunked from this source")
            
        if settings.retrieval_enable_vector:
            # Embeddings step
            vector_inputs = [c.content for c in chunks]
            embeddings = await embedding_provider.embed(vector_inputs)
            if len(embeddings) == len(chunks):
                chunks_with_emb = []
                for chunk, emb in zip(chunks, embeddings):
                    chunk.embedding = emb
                    chunks_with_emb.append(
                        ChunkWithEmbedding(chunk_id=chunk.id, source_id=chunk.source_id, embedding=emb)
                    )
                await vector_store.store_embeddings(chunks_with_emb)

        source_ingestion_repository.replace_chunks(source_id, chunks)

        job.stage = "citation_anchor_skeleton"
        job.progress = 80
        job.updated_at = utc_now()
        source_ingestion_repository.update_job(job)

        source.processing_progress = 80
        source.updated_at = utc_now()
        source_ingestion_repository.update_source(source)

        anchors = citation_anchor_service.build_anchors(source, chunks)
        source_ingestion_repository.replace_anchors(source_id, anchors)

        completed_at = utc_now()
        source.status = SourceStatus.READY
        source.processing_progress = 100
        source.chunk_count = len(chunks)
        source.error_message = None
        source.updated_at = completed_at
        source.processed_at = completed_at
        source_ingestion_repository.update_source(source)

        job.status = JobStatus.COMPLETED
        job.stage = "completed"
        job.progress = 100
        job.result = {
            "chunk_count": len(chunks),
            "anchor_count": len(anchors),
            "parser_type": source.parser_type,
        }
        job.updated_at = completed_at
        job.completed_at = completed_at
        source_ingestion_repository.update_job(job)
    except Exception as exc:
        failed_at = utc_now()
        source_ingestion_repository.replace_chunks(source_id, [])
        source_ingestion_repository.replace_anchors(source_id, [])

        source.status = SourceStatus.FAILED
        source.processing_progress = 100
        source.chunk_count = 0
        source.error_message = str(exc)
        source.updated_at = failed_at
        source_ingestion_repository.update_source(source)

        job.status = JobStatus.FAILED
        job.stage = "failed"
        job.progress = 100
        job.error_message = str(exc)
        job.updated_at = failed_at
        job.completed_at = failed_at
        source_ingestion_repository.update_job(job)
