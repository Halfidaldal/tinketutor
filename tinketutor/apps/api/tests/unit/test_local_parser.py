from __future__ import annotations

from app.providers import local_parser as local_parser_module
from app.providers.local_parser import DevelopmentParserProvider


class _FakePage:
    def __init__(self, text: str) -> None:
        self._text = text

    def extract_text(self) -> str:
        return self._text


class _FakeMetadata:
    title = "Directional Alignment"


class _FakeReader:
    def __init__(self, _path: str) -> None:
        self.pages = [
            _FakePage("Page one\nAsymmetry matters."),
            _FakePage("Page two\nNarrative agency matters too."),
        ]
        self.metadata = _FakeMetadata()


def test_parse_pdf_prefers_pypdf_when_available(tmp_path, monkeypatch) -> None:
    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n")

    monkeypatch.setattr(local_parser_module, "PdfReader", _FakeReader)

    parsed_document = DevelopmentParserProvider()._parse_pdf(pdf_path)

    assert parsed_document.metadata["parser_type"] == "pypdf"
    assert parsed_document.title == "Directional Alignment"
    assert parsed_document.page_count == 2
    assert [section.page_start for section in parsed_document.sections] == [1, 2]
    assert "Asymmetry matters." in parsed_document.raw_text
    assert "Narrative agency matters too." in parsed_document.raw_text
