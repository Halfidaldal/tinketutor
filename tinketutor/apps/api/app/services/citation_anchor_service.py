"""
Citation-anchor skeleton generation for SourceIngestion.

Each persisted chunk receives one anchor record in this phase. Later phases can
replace this with page-accurate or span-accurate anchor extraction without
changing downstream contracts.
"""

from __future__ import annotations

from hashlib import sha1

from app.domain.models import CitationAnchor, Chunk, Source
from app.infra.store import utc_now


def _make_anchor_id(chunk_id: str) -> str:
    return sha1(f"anchor:{chunk_id}".encode("utf-8")).hexdigest()[:20]


def build_anchors(source: Source, chunks: list[Chunk]) -> list[CitationAnchor]:
    now = utc_now()
    anchors: list[CitationAnchor] = []

    for chunk in chunks:
        anchors.append(
            CitationAnchor(
                id=_make_anchor_id(chunk.id),
                notebook_id=source.notebook_id,
                source_id=source.id,
                chunk_id=chunk.id,
                source_title=source.title,
                parser_type=source.parser_type,
                page_start=chunk.position.page_start,
                page_end=chunk.position.page_end,
                section_title=chunk.position.section_title,
                char_start=chunk.position.char_start,
                char_end=chunk.position.char_end,
                snippet_text=chunk.content[:320],
                order_index=chunk.order_index,
                created_at=now,
            )
        )

    return anchors
