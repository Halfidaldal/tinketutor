"""
In-Memory Store — Lightweight persistence for Phase 4.

Provides a simple dict-based store that mimics a Firestore-like interface.
Easy to swap for real Firestore in Phase 5 — all access goes through
service layer, never directly from routers.

This approach:
- Zero external dependencies (no Firebase SDK needed to run locally)
- Thread-safe via module-level dicts (single-process uvicorn)
- Preserves the repository pattern the services expect
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import uuid


def new_id() -> str:
    """Generate a new document ID (mimics Firestore auto-ID)."""
    return uuid.uuid4().hex[:20]


def utc_now() -> datetime:
    """UTC timestamp for all created_at / updated_at fields."""
    return datetime.now(timezone.utc)


# ---- In-memory collections ----
# Each is a dict[str, dict] keyed by document ID.
# The inner dict is the serialized domain model.

_DATA_DIR = Path(__file__).resolve().parents[2] / ".local_data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_collection(name: str) -> dict[str, dict]:
    collection_path = _DATA_DIR / f"{name}.json"
    if not collection_path.exists():
        return {}
    with collection_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


notebooks: dict[str, dict] = _load_collection("notebooks")
sources: dict[str, dict] = _load_collection("sources")
chunks: dict[str, dict] = _load_collection("chunks")
citations: dict[str, dict] = _load_collection("citations")
citation_anchors: dict[str, dict] = _load_collection("citation_anchors")
processing_jobs: dict[str, dict] = _load_collection("processing_jobs")
tutor_sessions: dict[str, dict] = _load_collection("tutor_sessions")
tutor_turns: dict[str, dict] = _load_collection("tutor_turns")
concept_maps: dict[str, dict] = _load_collection("concept_maps")
concept_nodes: dict[str, dict] = _load_collection("concept_nodes")
concept_edges: dict[str, dict] = _load_collection("concept_edges")
quiz_items: dict[str, dict] = _load_collection("quiz_items")
quiz_attempts: dict[str, dict] = _load_collection("quiz_attempts")
gap_reports: dict[str, dict] = _load_collection("gap_reports")
gap_findings: dict[str, dict] = _load_collection("gap_findings")

collections: dict[str, dict[str, dict]] = {
    "notebooks": notebooks,
    "sources": sources,
    "chunks": chunks,
    "citations": citations,
    "citation_anchors": citation_anchors,
    "processing_jobs": processing_jobs,
    "tutor_sessions": tutor_sessions,
    "tutor_turns": tutor_turns,
    "concept_maps": concept_maps,
    "concept_nodes": concept_nodes,
    "concept_edges": concept_edges,
    "quiz_items": quiz_items,
    "quiz_attempts": quiz_attempts,
    "gap_reports": gap_reports,
    "gap_findings": gap_findings,
}

def persist_collection(name: str) -> None:
    collection = collections[name]
    collection_path = _DATA_DIR / f"{name}.json"
    with collection_path.open("w", encoding="utf-8") as handle:
        json.dump(collection, handle, indent=2, sort_keys=True)

