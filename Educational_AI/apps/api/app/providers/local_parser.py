"""
Development parser implementation.

This keeps the parser seam real without hardwiring external SDKs into service
logic. PDF support uses `pypdf` for text-based documents and intentionally
fails fast on unreadable output so retrieval does not index gibberish.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

from app.domain.exceptions import ProviderError
from app.domain.models import ParsedDocument, ParsedSection
from app.providers.parser import ParserProvider
from app.services import text_quality_service


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
DRAWING_NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


class DevelopmentParserProvider(ParserProvider):
    async def parse(self, file_path: str, file_type: str) -> ParsedDocument:
        return await asyncio.to_thread(self._parse_sync, file_path, file_type)

    def _parse_sync(self, file_path: str, file_type: str) -> ParsedDocument:
        normalized_type = file_type.lower()
        path = Path(file_path)

        if normalized_type == "docx":
            return self._parse_docx(path)
        if normalized_type == "pptx":
            return self._parse_pptx(path)
        if normalized_type == "pdf":
            return self._parse_pdf(path)

        raise ProviderError("parser", f"Unsupported file type '{file_type}' in development parser")

    def _parse_docx(self, path: Path) -> ParsedDocument:
        sections: list[ParsedSection] = []
        current_title: str | None = None
        current_content: list[str] = []

        try:
            with zipfile.ZipFile(path) as archive:
                xml_bytes = archive.read("word/document.xml")
        except Exception as exc:
            raise ProviderError("parser", f"Unable to read DOCX file: {exc}") from exc

        root = ET.fromstring(xml_bytes)

        for paragraph in root.findall(".//w:body/w:p", WORD_NS):
            texts = [node.text for node in paragraph.findall(".//w:t", WORD_NS) if node.text]
            content = "".join(texts).strip()
            if not content:
                continue

            style = paragraph.find(".//w:pStyle", WORD_NS)
            style_value = ""
            if style is not None:
                style_value = style.attrib.get(f"{{{WORD_NS['w']}}}val", "").lower()

            is_heading = style_value.startswith("heading")
            if is_heading:
                if current_content:
                    sections.append(
                        ParsedSection(
                            title=current_title,
                            content="\n\n".join(current_content),
                            page_start=1,
                            page_end=1,
                            level=1,
                        )
                    )
                    current_content = []
                current_title = content
            else:
                current_content.append(content)

        if current_content:
            sections.append(
                ParsedSection(
                    title=current_title,
                    content="\n\n".join(current_content),
                    page_start=1,
                    page_end=1,
                    level=1,
                )
            )

        raw_text = "\n\n".join(section.content for section in sections)
        if not raw_text.strip():
            raise ProviderError("parser", "No readable text found in DOCX document")

        return ParsedDocument(
            title=path.stem,
            sections=sections,
            raw_text=raw_text,
            page_count=1,
            metadata={"parser_type": "docx_zip_xml"},
        )

    def _parse_pptx(self, path: Path) -> ParsedDocument:
        sections: list[ParsedSection] = []

        try:
            with zipfile.ZipFile(path) as archive:
                slide_names = sorted(
                    name
                    for name in archive.namelist()
                    if name.startswith("ppt/slides/slide") and name.endswith(".xml")
                )
                for index, slide_name in enumerate(slide_names, start=1):
                    root = ET.fromstring(archive.read(slide_name))
                    texts = [node.text.strip() for node in root.findall(".//a:t", DRAWING_NS) if node.text and node.text.strip()]
                    if not texts:
                        continue
                    slide_content = "\n".join(texts)
                    sections.append(
                        ParsedSection(
                            title=texts[0][:120],
                            content=slide_content,
                            page_start=index,
                            page_end=index,
                            level=1,
                        )
                    )
        except Exception as exc:
            raise ProviderError("parser", f"Unable to read PPTX file: {exc}") from exc

        raw_text = "\n\n".join(section.content for section in sections)
        if not raw_text.strip():
            raise ProviderError("parser", "No readable text found in PPTX document")

        return ParsedDocument(
            title=path.stem,
            sections=sections,
            raw_text=raw_text,
            page_count=max(len(sections), 1),
            metadata={"parser_type": "pptx_zip_xml"},
        )

    def _parse_pdf(self, path: Path) -> ParsedDocument:
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ProviderError(
                "parser",
                "pypdf is required for PDF ingestion. Install the dependency and retry.",
            ) from exc

        try:
            reader = PdfReader(str(path), strict=False)
        except Exception as exc:
            raise ProviderError("parser", f"Unable to read PDF file: {exc}") from exc

        sections: list[ParsedSection] = []
        unreadable_pages: list[int] = []
        page_count = max(len(reader.pages), 1)

        for page_number, page in enumerate(reader.pages, start=1):
            page_text, is_readable = self._extract_pdf_page_text(page)
            if not page_text:
                continue
            if not is_readable:
                unreadable_pages.append(page_number)
                continue

            sections.append(
                ParsedSection(
                    title=None,
                    content=page_text,
                    page_start=page_number,
                    page_end=page_number,
                    level=1,
                )
            )

        if not sections:
            if unreadable_pages:
                raise ProviderError(
                    "parser",
                    "PDF text extraction produced unreadable text. The document likely uses unsupported font encoding or requires OCR.",
                )
            raise ProviderError(
                "parser",
                "No readable text found in PDF document. The PDF may be image-only and requires OCR support.",
            )

        raw_text = "\n\n".join(section.content for section in sections).strip()
        metadata: dict[str, object] = {
            "parser_type": "pdf_pypdf_text",
            "readable_page_count": len(sections),
        }
        if unreadable_pages:
            metadata["skipped_unreadable_pages"] = unreadable_pages

        return ParsedDocument(
            title=path.stem,
            sections=sections,
            raw_text=raw_text,
            page_count=page_count,
            metadata=metadata,
        )

    def _extract_pdf_page_text(self, page) -> tuple[str, bool]:
        candidates: list[tuple[str, bool]] = []

        for extraction_mode in ("plain", "layout"):
            try:
                extracted = page.extract_text(extraction_mode=extraction_mode) or ""
            except Exception:
                continue

            normalized = text_quality_service.normalize_extracted_text(extracted)
            if not normalized:
                continue

            candidates.append(
                (
                    normalized,
                    text_quality_service.looks_readable_text(normalized),
                )
            )

        if not candidates:
            return "", False

        readable_candidates = [candidate for candidate in candidates if candidate[1]]
        chosen_text, is_readable = max(
            readable_candidates or candidates,
            key=lambda candidate: len(candidate[0]),
        )
        return chosen_text, is_readable
