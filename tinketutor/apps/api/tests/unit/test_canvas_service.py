from __future__ import annotations

from app.domain.enums import EvidenceSupport
from app.domain.models import ConceptEvidenceReference
from app.services.canvas_service import _build_summary, _clean_phrase


def test_clean_phrase_rejects_garbled_single_character_sequences() -> None:
    assert _clean_phrase(["H", "å", "e", "M"]) is None
    assert _clean_phrase(["O", "v"]) is None


def test_build_summary_falls_back_to_label_for_garbled_snippets() -> None:
    reference = ConceptEvidenceReference(
        source_id="source-1",
        source_title="Notebook Source",
        chunk_id="chunk-1",
        snippet_text="H å e M Ô³¼© M¹√Ør½ +AÎ Ý Ñ&×=uèìø",
        page_start=1,
        page_end=1,
        score=0.2,
        support=EvidenceSupport.WEAK,
    )

    assert _build_summary("Asymmetry", [reference]) == "Asymmetry"
