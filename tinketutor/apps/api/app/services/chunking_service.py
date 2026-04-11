"""
Deterministic document chunking for SourceIngestion.

This phase intentionally keeps chunking inspectable and boring:
- paragraph-first segmentation
- configurable target and overlap by approximate token count
- stable chunk order and locator metadata

Embeddings and retrieval are deferred to later phases.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1
import re

from app.config import settings
from app.domain.enums import Language
from app.domain.models import Chunk, ChunkMetadata, ChunkPosition, ParsedDocument, ParsedSection, Source
from app.infra.store import utc_now


@dataclass
class _ChunkUnit:
    content: str
    page_start: int
    page_end: int
    section_title: str | None
    paragraph_index: int
    char_start: int
    char_end: int
    hierarchy_path: list[str]


def _estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _split_paragraphs(text: str) -> list[str]:
    normalized = _normalize_text(text)
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", normalized) if part.strip()]
    if paragraphs:
        return paragraphs
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if lines:
        return lines
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]
    return sentences or ([normalized] if normalized else [])


def _detect_language(text: str) -> Language:
    lowered = text.lower()
    danish_markers = (" æ", " ø", " å", " og ", " det ", " ikke ", " med ")
    english_markers = (" the ", " and ", " not ", " with ", " from ", " that ")
    danish_score = sum(lowered.count(marker) for marker in danish_markers)
    english_score = sum(lowered.count(marker) for marker in english_markers)
    if danish_score > english_score and danish_score > 0:
        return Language.DA
    if english_score > danish_score and english_score > 0:
        return Language.EN
    return Language.UNKNOWN


def _make_chunk_id(source_id: str, order_index: int, char_start: int, char_end: int) -> str:
    digest = sha1(f"{source_id}:{order_index}:{char_start}:{char_end}".encode("utf-8")).hexdigest()
    return digest[:20]


def _iter_units(document: ParsedDocument) -> list[_ChunkUnit]:
    units: list[_ChunkUnit] = []
    sections = document.sections or [
        ParsedSection(
            title=document.title,
            content=document.raw_text,
            page_start=1,
            page_end=max(document.page_count, 1),
            level=1,
        )
    ]

    cursor = 0
    for section in sections:
        section_title = section.title.strip() if section.title else None
        paragraphs = _split_paragraphs(section.content)
        hierarchy_path = [section_title] if section_title else []

        for paragraph_index, paragraph in enumerate(paragraphs):
            normalized = _normalize_text(paragraph)
            if not normalized:
                continue

            char_start = cursor
            char_end = char_start + len(normalized)
            cursor = char_end + 2

            units.append(
                _ChunkUnit(
                    content=normalized,
                    page_start=section.page_start,
                    page_end=section.page_end,
                    section_title=section_title,
                    paragraph_index=paragraph_index,
                    char_start=char_start,
                    char_end=char_end,
                    hierarchy_path=hierarchy_path,
                )
            )
    return units


def build_chunks(source: Source, document: ParsedDocument) -> list[Chunk]:
    units = _iter_units(document)
    if not units:
        return []

    chunks: list[Chunk] = []
    target_tokens = max(settings.chunk_target_tokens, 1)
    overlap_tokens = max(settings.chunk_overlap_tokens, 0)
    now = utc_now()
    start_index = 0

    while start_index < len(units):
        current_units: list[_ChunkUnit] = []
        token_total = 0
        end_index = start_index

        while end_index < len(units):
            unit = units[end_index]
            unit_tokens = _estimate_tokens(unit.content)
            if current_units and token_total + unit_tokens > target_tokens:
                break
            current_units.append(unit)
            token_total += unit_tokens
            end_index += 1

        if not current_units:
            current_units = [units[start_index]]
            end_index = start_index + 1
            token_total = _estimate_tokens(current_units[0].content)

        first_unit = current_units[0]
        last_unit = current_units[-1]
        chunk_content = "\n\n".join(unit.content for unit in current_units)
        language = _detect_language(chunk_content)
        order_index = len(chunks)

        chunks.append(
            Chunk(
                id=_make_chunk_id(source.id, order_index, first_unit.char_start, last_unit.char_end),
                notebook_id=source.notebook_id,
                source_id=source.id,
                user_id=source.user_id,
                order_index=order_index,
                content=chunk_content,
                token_count=token_total,
                embedding=[],
                position=ChunkPosition(
                    page_start=first_unit.page_start,
                    page_end=last_unit.page_end,
                    section_title=first_unit.section_title,
                    chapter_title=None,
                    paragraph_index=first_unit.paragraph_index,
                    char_start=first_unit.char_start,
                    char_end=last_unit.char_end,
                ),
                metadata=ChunkMetadata(
                    language=language,
                    has_table="|" in chunk_content or "\t" in chunk_content,
                    has_image=False,
                    hierarchy_path=first_unit.hierarchy_path,
                ),
                created_at=now,
            )
        )

        if end_index >= len(units):
            break

        overlap_start = end_index
        accumulated_overlap = 0
        while overlap_start > start_index:
            candidate = units[overlap_start - 1]
            accumulated_overlap += _estimate_tokens(candidate.content)
            if accumulated_overlap > overlap_tokens:
                break
            overlap_start -= 1

        start_index = overlap_start if overlap_start < end_index else end_index

    return chunks
