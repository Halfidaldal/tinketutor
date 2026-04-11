from __future__ import annotations

from pathlib import Path

import pytest
from pypdf._page import PageObject

from app.domain.exceptions import ProviderError
from app.providers.local_parser import DevelopmentParserProvider
from app.services import text_quality_service


def _escape_pdf_string(value: str) -> str:
    return value.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _make_text_pdf(page_texts: list[str]) -> bytes:
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    page_ids: list[int] = []
    next_id = 4
    for text in page_texts:
        page_id = next_id
        content_id = next_id + 1
        next_id += 2
        page_ids.append(page_id)

        stream = (
            "BT\n"
            "/F1 12 Tf\n"
            "72 720 Td\n"
            f"({_escape_pdf_string(text)}) Tj\n"
            "ET"
        ).encode("ascii")
        objects.append(
            (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        objects.append(
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        )

    objects[1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] "
        f"/Count {len(page_ids)} >>"
    ).encode("ascii")

    parts = [b"%PDF-1.4\n"]
    offsets = [0]
    current_offset = len(parts[0])

    for object_id, payload in enumerate(objects, start=1):
        header = f"{object_id} 0 obj\n".encode("ascii")
        footer = b"\nendobj\n"
        offsets.append(current_offset)
        parts.extend([header, payload, footer])
        current_offset += len(header) + len(payload) + len(footer)

    xref_offset = current_offset
    xref_lines = [f"xref\n0 {len(objects) + 1}\n".encode("ascii"), b"0000000000 65535 f \n"]
    xref_lines.extend(f"{offset:010d} 00000 n \n".encode("ascii") for offset in offsets[1:])
    trailer = (
        f"trailer\n<< /Root 1 0 R /Size {len(objects) + 1} >>\n"
        f"startxref\n{xref_offset}\n%%EOF"
    ).encode("ascii")
    parts.extend(xref_lines)
    parts.append(trailer)
    return b"".join(parts)


def test_local_pdf_parser_extracts_page_level_text(tmp_path: Path):
    pdf_path = tmp_path / "overview.pdf"
    pdf_path.write_bytes(
        _make_text_pdf(
            [
                "Final results overview",
                "Mitochondria produce ATP through oxidative phosphorylation.",
            ]
        )
    )

    parsed = DevelopmentParserProvider()._parse_sync(str(pdf_path), "pdf")

    assert parsed.metadata["parser_type"] == "pdf_pypdf_text"
    assert parsed.page_count == 2
    assert len(parsed.sections) == 2
    assert parsed.sections[0].page_start == 1
    assert parsed.sections[0].page_end == 1
    assert parsed.sections[1].page_start == 2
    assert parsed.sections[1].page_end == 2
    assert "Final results overview" in parsed.raw_text
    assert "oxidative phosphorylation" in parsed.raw_text


def test_local_pdf_parser_rejects_unreadable_text_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    pdf_path = tmp_path / "corrupted.pdf"
    pdf_path.write_bytes(_make_text_pdf(["Readable placeholder text"]))

    gibberish = ("ñr\x08ñJ±CL.<Ý" * 16).strip()
    monkeypatch.setattr(PageObject, "extract_text", lambda self, *args, **kwargs: gibberish)

    with pytest.raises(ProviderError, match="unreadable text"):
        DevelopmentParserProvider()._parse_sync(str(pdf_path), "pdf")


def test_text_quality_flags_gibberish():
    gibberish = ("ñr\x08ñJ±CL.<Ý" * 16).strip()
    readable = (
        "Cellular respiration converts glucose into ATP inside the mitochondria. "
        "The electron transport chain creates the proton gradient that powers ATP synthase."
    )

    assert text_quality_service.looks_readable_text(readable) is True
    assert text_quality_service.looks_readable_text(gibberish) is False
