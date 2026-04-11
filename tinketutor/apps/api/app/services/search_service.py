from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import replace
import re
import unicodedata

from google.api_core.exceptions import FailedPrecondition

from app.config import settings
from app.domain.enums import EvidenceSupport, RetrievalMode, SupportAssessment
from app.domain.exceptions import NotFoundError, ProviderError, ValidationError
from app.domain.models import ChunkWithEmbedding, EvidenceChunk, EvidencePack, ScoredChunk
from app.infra.store import new_id, utc_now
from app.providers.embedding import EmbeddingProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.repositories import knowledge_retrieval_repository
from app.services import citation_service, notebook_service


ENGLISH_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "i", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to",
    "was", "what", "when", "where", "which", "who", "why", "with",
}
DANISH_STOPWORDS = {
    "af", "at", "de", "den", "der", "det", "en", "er", "et", "for", "fra",
    "hvad", "hvem", "hvilke", "hvor", "hvordan", "i", "ikke", "med", "og",
    "om", "på", "som", "til", "var",
}
STOPWORDS = ENGLISH_STOPWORDS | DANISH_STOPWORDS


def _normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold().strip()


def _tokenize(value: str) -> list[str]:
    return re.findall(r"\w+", _normalize_text(value), flags=re.UNICODE)


def _meaningful_tokens(tokens: list[str]) -> list[str]:
    filtered = [token for token in tokens if len(token) > 1 and token not in STOPWORDS]
    if filtered:
        return filtered
    fallback = [token for token in tokens if len(token) > 1]
    return fallback or tokens


def _support_from_score(score: float) -> EvidenceSupport:
    if score >= settings.search_strong_support_threshold:
        return EvidenceSupport.STRONG
    if score >= settings.search_partial_support_threshold:
        return EvidenceSupport.PARTIAL
    return EvidenceSupport.WEAK


def _list_anchors_for_chunk(source_id: str, chunk_id: str):
    try:
        return knowledge_retrieval_repository.list_anchors_for_source_chunk(source_id, chunk_id)
    except FailedPrecondition as error:
        message = str(error)
        if "citationAnchors" in message and "chunk_id" in message:
            raise ProviderError(
                "firestore",
                "Citation anchor index is still building. Retry in a moment.",
            ) from error
        raise


def _lexical_candidates(
    query: str,
    *,
    chunks: Iterable,
    sources_by_id: dict[str, object],
) -> list[dict]:
    query_tokens = _meaningful_tokens(_tokenize(query))
    normalized_query = _normalize_text(query)
    results: list[dict] = []

    for chunk in chunks:
        source = sources_by_id.get(chunk.source_id)
        if source is None:
            continue

        corpus = f"{source.title}\n{chunk.content}"
        normalized_corpus = _normalize_text(corpus)
        chunk_tokens = _tokenize(corpus)
        token_counts = Counter(chunk_tokens)
        query_token_set = set(query_tokens)
        matched_tokens = {token for token in query_token_set if token_counts.get(token, 0) > 0}
        substring_hits = sum(
            1 for token in query_token_set
            if len(token) >= 4 and token in normalized_corpus
        )

        if not matched_tokens and substring_hits == 0 and normalized_query not in normalized_corpus:
            continue

        overlap_ratio = len(matched_tokens) / max(len(query_token_set), 1)
        term_frequency = sum(token_counts[token] for token in matched_tokens)
        density = min(1.0, (term_frequency / max(len(chunk_tokens), 1)) * 40)
        phrase_bonus = 0.2 if len(query_tokens) > 1 and normalized_query in normalized_corpus else 0.0
        source_title_tokens = set(_meaningful_tokens(_tokenize(source.title)))
        title_overlap = len(source_title_tokens & query_token_set) / max(len(query_token_set), 1)
        substring_bonus = min(0.15, substring_hits * 0.05)

        score = min(
            1.0,
            (overlap_ratio * 0.6)
            + (density * 0.15)
            + (title_overlap * 0.1)
            + phrase_bonus
            + substring_bonus,
        )
        if score < settings.lexical_search_min_score:
            continue

        results.append(
            {
                "chunk_id": chunk.id,
                "source_id": chunk.source_id,
                "keyword_score": score,
            }
        )

    results.sort(key=lambda item: item["keyword_score"], reverse=True)
    return results


def _fuse_results(
    lexical_results: list[dict],
    vector_results: list[ScoredChunk],
) -> tuple[list[dict], RetrievalMode]:
    if lexical_results and vector_results:
        fused: dict[str, dict] = {}

        for rank, item in enumerate(lexical_results, start=1):
            entry = fused.setdefault(
                item["chunk_id"],
                {
                    "chunk_id": item["chunk_id"],
                    "source_id": item["source_id"],
                    "keyword_score": 0.0,
                    "vector_score": 0.0,
                    "combined_score": 0.0,
                },
            )
            entry["keyword_score"] = item["keyword_score"]
            entry["combined_score"] += 1.0 / (60 + rank)

        for rank, item in enumerate(vector_results, start=1):
            entry = fused.setdefault(
                item.chunk_id,
                {
                    "chunk_id": item.chunk_id,
                    "source_id": item.source_id,
                    "keyword_score": 0.0,
                    "vector_score": 0.0,
                    "combined_score": 0.0,
                },
            )
            entry["vector_score"] = item.score
            entry["combined_score"] += 1.0 / (60 + rank)

        combined = sorted(
            fused.values(),
            key=lambda item: (
                item["combined_score"],
                item["keyword_score"],
                item["vector_score"],
            ),
            reverse=True,
        )
        return combined, RetrievalMode.HYBRID

    if vector_results:
        return [
            {
                "chunk_id": item.chunk_id,
                "source_id": item.source_id,
                "keyword_score": 0.0,
                "vector_score": item.score,
                "combined_score": item.score,
            }
            for item in vector_results
        ], RetrievalMode.VECTOR

    return [
        {
            "chunk_id": item["chunk_id"],
            "source_id": item["source_id"],
            "keyword_score": item["keyword_score"],
            "vector_score": 0.0,
            "combined_score": item["keyword_score"],
        }
        for item in lexical_results
    ], RetrievalMode.LEXICAL


async def _backfill_chunk_embeddings(
    *,
    chunks: list,
    embedding_provider: EmbeddingProvider,
    vector_store: VectorStore,
) -> int:
    pending_chunks = [
        chunk
        for chunk in chunks
        if not chunk.embedding and chunk.content.strip()
    ]
    if not pending_chunks:
        return 0

    embeddings = await embedding_provider.embed([chunk.content for chunk in pending_chunks])
    if len(embeddings) != len(pending_chunks):
        return 0

    chunks_with_embeddings: list[ChunkWithEmbedding] = []
    for chunk, embedding in zip(pending_chunks, embeddings, strict=False):
        if not embedding:
            continue
        chunk.embedding = embedding
        chunks_with_embeddings.append(
            ChunkWithEmbedding(
                chunk_id=chunk.id,
                source_id=chunk.source_id,
                embedding=embedding,
            )
        )

    if not chunks_with_embeddings:
        return 0

    await vector_store.store_embeddings(chunks_with_embeddings)
    return len(chunks_with_embeddings)


async def get_retrieval_readiness(notebook_id: str, user_id: str) -> dict:
    notebook = notebook_service.get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    ready_sources = knowledge_retrieval_repository.list_ready_sources(notebook_id, user_id)
    ready_source_ids = [source.id for source in ready_sources]
    chunks = knowledge_retrieval_repository.list_chunks_for_source_ids(ready_source_ids)

    traceable_chunk_count = 0
    anchor_count = 0
    anchor_index_pending = False
    for chunk in chunks:
        try:
            anchors = _list_anchors_for_chunk(chunk.source_id, chunk.id)
        except ProviderError as error:
            if "index is still building" not in error.message.casefold():
                raise
            anchor_index_pending = True
            break
        anchor_count += len(anchors)
        if anchors:
            traceable_chunk_count += 1

    blocking_reasons: list[str] = []
    if not ready_sources:
        blocking_reasons.append("No ready sources are available in this notebook.")
    if ready_sources and not chunks:
        blocking_reasons.append("Ready sources exist, but no chunks have been persisted yet.")
    if anchor_index_pending:
        blocking_reasons.append("Citation anchor index is still building. Retry in a moment.")
    elif chunks and traceable_chunk_count == 0:
        blocking_reasons.append("Chunks exist, but citation anchors are incomplete.")

    return {
        "notebook_id": notebook_id,
        "total_source_count": len(notebook.get("source_ids", [])),
        "ready_source_count": len(ready_sources),
        "chunk_count": len(chunks),
        "traceable_chunk_count": traceable_chunk_count,
        "citation_anchor_count": anchor_count,
        "retrieval_ready": len(blocking_reasons) == 0,
        "blocking_reasons": blocking_reasons,
    }


async def build_evidence_pack(
    *,
    notebook_id: str,
    user_id: str,
    query: str,
    requested_source_ids: list[str] | None,
    top_k: int,
    vector_store: VectorStore,
    embedding_provider: EmbeddingProvider,
    reranker: Reranker,
) -> EvidencePack:
    notebook = notebook_service.get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    normalized_query = query.strip()
    if not normalized_query:
        raise ValidationError("Query is required")

    ready_sources = knowledge_retrieval_repository.list_ready_sources(notebook_id, user_id)
    ready_sources_by_id = {source.id: source for source in ready_sources}
    notebook_source_ids = set(notebook.get("source_ids", []))

    if requested_source_ids:
        invalid_source_ids = [source_id for source_id in requested_source_ids if source_id not in notebook_source_ids]
        if invalid_source_ids:
            raise ValidationError(f"Source IDs are outside this notebook: {', '.join(invalid_source_ids)}")
        scoped_source_ids = [source_id for source_id in requested_source_ids if source_id in ready_sources_by_id]
    else:
        scoped_source_ids = list(ready_sources_by_id.keys())

    evidence_pack = EvidencePack(
        id=new_id(),
        query=normalized_query,
        notebook_id=notebook_id,
        source_ids=scoped_source_ids,
        retrieval_mode=RetrievalMode.LEXICAL,
        support_assessment=SupportAssessment.INSUFFICIENT_GROUNDING,
        insufficient_grounding=True,
        generated_at=utc_now(),
    )

    if not scoped_source_ids:
        evidence_pack.support_assessment = SupportAssessment.NO_READY_SOURCES
        evidence_pack.insufficiency_reason = "The notebook has no ready sources available for retrieval."
        evidence_pack.diagnostics = {
            "ready_source_count": len(ready_sources),
            "requested_source_count": len(requested_source_ids or []),
        }
        return evidence_pack

    chunks = knowledge_retrieval_repository.list_chunks_for_source_ids(scoped_source_ids)
    if not chunks:
        evidence_pack.support_assessment = SupportAssessment.NO_MATCHING_EVIDENCE
        evidence_pack.insufficiency_reason = "Ready sources exist, but no persisted chunks are available for retrieval."
        evidence_pack.diagnostics = {"ready_source_count": len(ready_sources)}
        return evidence_pack

    sources_by_id = {
        source_id: ready_sources_by_id[source_id]
        for source_id in scoped_source_ids
        if source_id in ready_sources_by_id
    }
    lexical_results = _lexical_candidates(
        normalized_query,
        chunks=chunks,
        sources_by_id=sources_by_id,
    )

    vector_results: list[ScoredChunk] = []
    backfilled_embedding_count = 0
    if settings.retrieval_enable_vector:
        backfilled_embedding_count = await _backfill_chunk_embeddings(
            chunks=chunks,
            embedding_provider=embedding_provider,
            vector_store=vector_store,
        )
    if settings.retrieval_enable_vector and any(chunk.embedding for chunk in chunks):
        query_embeddings = await embedding_provider.embed([normalized_query])
        if query_embeddings:
            vector_results = await vector_store.search(
                query_embedding=query_embeddings[0],
                source_ids=scoped_source_ids,
                top_k=max(top_k * 2, top_k),
            )

    fused_results, retrieval_mode = _fuse_results(lexical_results, vector_results)
    evidence_pack.retrieval_mode = retrieval_mode

    chunk_by_id = {chunk.id: chunk for chunk in chunks}
    missing_traceability: list[dict] = []
    evidence_items: list[EvidenceChunk] = []

    for candidate in fused_results[: max(top_k * 2, top_k)]:
        chunk = chunk_by_id.get(candidate["chunk_id"])
        source = sources_by_id.get(candidate["source_id"])
        anchors = _list_anchors_for_chunk(candidate["source_id"], candidate["chunk_id"])
        is_traceable, reason = citation_service.validate_traceability(
            notebook_id=notebook_id,
            source=source,
            chunk=chunk,
            anchors=anchors,
        )
        if not is_traceable:
            missing_traceability.append(
                {
                    "chunk_id": candidate["chunk_id"],
                    "source_id": candidate["source_id"],
                    "reason": reason,
                }
            )
            continue

        score = max(
            float(candidate["combined_score"]),
            float(candidate["keyword_score"]),
            float(candidate["vector_score"]),
        )
        support = _support_from_score(score)
        evidence_item = citation_service.build_traceable_evidence_chunk(
            notebook_id=notebook_id,
            evidence_pack_id=evidence_pack.id,
            source=source,
            chunk=chunk,
            anchors=anchors,
            score=score,
            rank=len(evidence_items) + 1,
            support=support,
            keyword_score=float(candidate["keyword_score"]),
            vector_score=float(candidate["vector_score"]),
        )
        if evidence_item is not None:
            evidence_items.append(evidence_item)
        if len(evidence_items) >= top_k:
            break

    evidence_items = await reranker.rerank(normalized_query, evidence_items)
    evidence_items = [
        replace(item, rank=index)
        for index, item in enumerate(evidence_items, start=1)
    ]
    evidence_pack.chunks = evidence_items
    evidence_pack.diagnostics = {
        "ready_source_count": len(ready_sources),
        "chunk_count": len(chunks),
        "embedded_chunk_count": sum(1 for chunk in chunks if chunk.embedding),
        "backfilled_embedding_count": backfilled_embedding_count,
        "lexical_candidate_count": len(lexical_results),
        "vector_candidate_count": len(vector_results),
        "excluded_untraceable": missing_traceability,
    }

    if not evidence_items:
        evidence_pack.support_assessment = (
            SupportAssessment.MISSING_TRACEABILITY
            if missing_traceability
            else SupportAssessment.NO_MATCHING_EVIDENCE
        )
        evidence_pack.insufficient_grounding = True
        evidence_pack.insufficiency_reason = (
            "Matching chunks were found, but citation anchors are missing, so the system cannot surface them responsibly."
            if missing_traceability
            else "No sufficiently relevant notebook evidence was found for this query."
        )
        return evidence_pack

    best_item = evidence_items[0]
    if best_item.support == EvidenceSupport.STRONG:
        evidence_pack.support_assessment = SupportAssessment.SUPPORTED
        evidence_pack.insufficient_grounding = False
        return evidence_pack

    evidence_pack.support_assessment = SupportAssessment.WEAK_EVIDENCE
    evidence_pack.insufficient_grounding = False
    evidence_pack.insufficiency_reason = "Only weak evidence was found for this query. Review the cited passages before relying on the result."
    return evidence_pack
