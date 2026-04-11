"""
Firebase Admin initialization plus Firestore collection helpers.

This module is the single backend entry point for Firebase-backed persistence:
- Firebase Admin app lifecycle
- Firestore client access
- Cloud Storage bucket access
- Collection/document reference helpers for the notebook-scoped data model

Normal runtime persistence must flow through these helpers rather than the JSON
collections in `app.infra.store`.
"""

from __future__ import annotations

import os
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore, storage

from app.config import settings


def _apply_emulator_environment() -> None:
    if settings.firebase_auth_emulator_host and "FIREBASE_AUTH_EMULATOR_HOST" not in os.environ:
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host
    if settings.firestore_emulator_host and "FIRESTORE_EMULATOR_HOST" not in os.environ:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
    storage_host = os.environ.get("STORAGE_EMULATOR_HOST") or settings.storage_emulator_host
    if storage_host:
        if not storage_host.startswith(("http://", "https://")):
            storage_host = f"http://{storage_host}"
        os.environ["STORAGE_EMULATOR_HOST"] = storage_host
    if settings.google_application_credentials and "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.google_application_credentials


def _firebase_options() -> dict[str, str]:
    options: dict[str, str] = {}
    project_id = settings.firebase_project_id or settings.google_cloud_project
    storage_bucket = settings.firebase_storage_bucket

    if project_id:
        options["projectId"] = project_id
    if storage_bucket:
        options["storageBucket"] = storage_bucket
    return options


@lru_cache(maxsize=1)
def get_firebase_app() -> firebase_admin.App:
    _apply_emulator_environment()

    try:
        return firebase_admin.get_app()
    except ValueError:
        credential = None
        if settings.google_application_credentials:
            credential = credentials.Certificate(settings.google_application_credentials)
        elif not os.getenv("FIRESTORE_EMULATOR_HOST") and not os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
            credential = credentials.ApplicationDefault()
        return firebase_admin.initialize_app(credential=credential, options=_firebase_options())


def initialize_firebase() -> firebase_admin.App:
    """Backward-compatible Firebase bootstrap helper for provider seams."""
    return get_firebase_app()


@lru_cache(maxsize=1)
def get_firestore_client() -> firestore.client:
    return firestore.client(app=get_firebase_app())


@lru_cache(maxsize=1)
def get_storage_bucket():
    bucket_name = settings.firebase_storage_bucket
    if bucket_name:
        return storage.bucket(bucket_name, app=get_firebase_app())
    return storage.bucket(app=get_firebase_app())


def get_project_id() -> str:
    return settings.firebase_project_id or settings.google_cloud_project


def users_collection():
    return get_firestore_client().collection("users")


def user_document(user_id: str):
    return users_collection().document(user_id)


def notebooks_collection():
    return get_firestore_client().collection("notebooks")


def notebook_document(notebook_id: str):
    return notebooks_collection().document(notebook_id)


def notebook_subcollection(notebook_id: str, name: str):
    return notebook_document(notebook_id).collection(name)


def citations_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "citations")


def notebook_citation_document(notebook_id: str, citation_id: str):
    return citations_collection(notebook_id).document(citation_id)


def tutor_sessions_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "tutorSessions")


def notebook_tutor_sessions_collection(notebook_id: str):
    return tutor_sessions_collection(notebook_id)


def notebook_tutor_session_document(notebook_id: str, session_id: str):
    return tutor_sessions_collection(notebook_id).document(session_id)


def tutor_turns_collection(notebook_id: str, session_id: str):
    return tutor_sessions_collection(notebook_id).document(session_id).collection("turns")


def tutor_session_turns_collection(notebook_id: str, session_id: str):
    return tutor_turns_collection(notebook_id, session_id)


def tutor_session_turn_document(notebook_id: str, session_id: str, turn_id: str):
    return tutor_turns_collection(notebook_id, session_id).document(turn_id)


def concept_maps_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "conceptMaps")


def notebook_concept_maps_collection(notebook_id: str):
    return concept_maps_collection(notebook_id)


def notebook_concept_map_document(notebook_id: str, concept_map_id: str):
    return concept_maps_collection(notebook_id).document(concept_map_id)


def concept_nodes_collection(notebook_id: str, concept_map_id: str):
    return concept_maps_collection(notebook_id).document(concept_map_id).collection("nodes")


def concept_map_nodes_collection(notebook_id: str, concept_map_id: str):
    return concept_nodes_collection(notebook_id, concept_map_id)


def concept_map_node_document(notebook_id: str, concept_map_id: str, node_id: str):
    return concept_nodes_collection(notebook_id, concept_map_id).document(node_id)


def concept_edges_collection(notebook_id: str, concept_map_id: str):
    return concept_maps_collection(notebook_id).document(concept_map_id).collection("edges")


def concept_map_edges_collection(notebook_id: str, concept_map_id: str):
    return concept_edges_collection(notebook_id, concept_map_id)


def concept_map_edge_document(notebook_id: str, concept_map_id: str, edge_id: str):
    return concept_edges_collection(notebook_id, concept_map_id).document(edge_id)


def quiz_items_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "quizItems")


def notebook_quiz_items_collection(notebook_id: str):
    return quiz_items_collection(notebook_id)


def notebook_quiz_item_document(notebook_id: str, quiz_item_id: str):
    return quiz_items_collection(notebook_id).document(quiz_item_id)


def quiz_attempts_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "quizAttempts")


def notebook_quiz_attempts_collection(notebook_id: str):
    return quiz_attempts_collection(notebook_id)


def notebook_quiz_attempt_document(notebook_id: str, attempt_id: str):
    return quiz_attempts_collection(notebook_id).document(attempt_id)


def gap_reports_collection(notebook_id: str):
    return notebook_subcollection(notebook_id, "gapReports")


def notebook_gap_reports_collection(notebook_id: str):
    return gap_reports_collection(notebook_id)


def notebook_gap_report_document(notebook_id: str, report_id: str):
    return gap_reports_collection(notebook_id).document(report_id)


def gap_findings_collection(notebook_id: str, gap_report_id: str):
    return gap_reports_collection(notebook_id).document(gap_report_id).collection("findings")


def gap_report_findings_collection(notebook_id: str, gap_report_id: str):
    return gap_findings_collection(notebook_id, gap_report_id)


def gap_report_finding_document(notebook_id: str, gap_report_id: str, finding_id: str):
    return gap_findings_collection(notebook_id, gap_report_id).document(finding_id)


def sources_collection():
    return get_firestore_client().collection("sources")


def source_document(source_id: str):
    return sources_collection().document(source_id)


def source_subcollection(source_id: str, name: str):
    return source_document(source_id).collection(name)


def chunks_collection(source_id: str):
    return source_subcollection(source_id, "chunks")


def source_chunks_collection(source_id: str):
    return chunks_collection(source_id)


def source_chunk_document(source_id: str, chunk_id: str):
    return chunks_collection(source_id).document(chunk_id)


def citation_anchors_collection(source_id: str):
    return source_subcollection(source_id, "citationAnchors")


def source_anchors_collection(source_id: str):
    return citation_anchors_collection(source_id)


def source_anchor_document(source_id: str, anchor_id: str):
    return citation_anchors_collection(source_id).document(anchor_id)


def jobs_collection():
    return get_firestore_client().collection("jobs")


def job_document(job_id: str):
    return jobs_collection().document(job_id)


def get_document_data(document_ref):
    snapshot = document_ref.get()
    return snapshot.to_dict() if snapshot.exists else None


def collection_group(group_name: str):
    return get_firestore_client().collection_group(group_name)


def list_collection_documents(collection_ref) -> list[dict]:
    return [snapshot.to_dict() for snapshot in collection_ref.stream()]


def recursive_delete(reference) -> None:
    get_firestore_client().recursive_delete(reference)
