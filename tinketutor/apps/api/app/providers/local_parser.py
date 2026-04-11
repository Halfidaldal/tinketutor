"""
Development parser implementation.

This keeps the parser seam real without hardwiring external SDKs into service
logic. PDF support is intentionally modest until a production parser such as
`unstructured` is wired in.
"""

from __future__ import annotations

import asyncio
from html import unescape
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib

from app.domain.exceptions import ProviderError
from app.domain.models import ParsedDocument, ParsedSection
from app.providers.parser import ParserProvider


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
            pdf_bytes = path.read_bytes()
        except Exception as exc:
            raise ProviderError("parser", f"Unable to read PDF file: {exc}") from exc

        text_fragments: list[str] = []
        for stream in re.findall(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.S):
            candidate_blocks = [stream.strip()]
            try:
                candidate_blocks.append(zlib.decompress(stream.strip()))
            except Exception:
                pass

            for block in candidate_blocks:
                decoded = block.decode("latin-1", errors="ignore")
                text_fragments.extend(self._extract_pdf_text(decoded))

        raw_text = "\n".join(fragment for fragment in text_fragments if fragment.strip())
        raw_text = re.sub(r"\n{3,}", "\n\n", raw_text).strip()
        if not raw_text:
            raise ProviderError(
                "parser",
                "PDF text extraction failed in the local parser. Install a production parser for broader PDF coverage.",
            )

        page_count = max(pdf_bytes.count(b"/Type /Page"), 1)
        section_title = raw_text.splitlines()[0][:120] if raw_text.splitlines() else path.stem
        return ParsedDocument(
            title=path.stem,
            sections=[
                ParsedSection(
                    title=section_title,
                    content=raw_text,
                    page_start=1,
                    page_end=page_count,
                    level=1,
                )
            ],
            raw_text=raw_text,
            page_count=page_count,
            metadata={"parser_type": "pdf_stream_fallback"},
        )

    def _extract_pdf_text(self, decoded_stream: str) -> list[str]:
        results: list[str] = []

        for match in re.finditer(r"\((.*?)\)\s*Tj", decoded_stream, re.S):
            value = self._decode_pdf_string(match.group(1))
            if value.strip():
                results.append(unescape(value))

        for match in re.finditer(r"\[(.*?)\]\s*TJ", decoded_stream, re.S):
            parts = re.findall(r"\((.*?)\)", match.group(1), re.S)
            value = "".join(self._decode_pdf_string(part) for part in parts)
            if value.strip():
                results.append(unescape(value))

        for match in re.finditer(r"\((.*?)\)\s*['\"]", decoded_stream, re.S):
            value = self._decode_pdf_string(match.group(1))
            if value.strip():
                results.append(unescape(value))

        return results

    def _decode_pdf_string(self, value: str) -> str:
        value = value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
        value = value.replace(r"\n", "\n").replace(r"\r", "\r").replace(r"\t", "\t")
        return re.sub(r"\\([0-7]{1,3})", lambda match: chr(int(match.group(1), 8)), value)
