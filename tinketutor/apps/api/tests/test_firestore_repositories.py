from __future__ import annotations

from app.domain.enums import CreatedBy, EvidenceSupport, MapGenerationStatus, SourceStatus, SupportAssessment
from app.domain.models import (
    Chunk,
    ChunkMetadata,
    ChunkPosition,
    CitationAnchor,
    ConceptEdge,
    ConceptEvidenceReference,
    ConceptMap,
    ConceptNode,
    Notebook,
    Source,
)
from app.infra.store import new_id, utc_now
from app.repositories import concept_map_repository, notebook_repository, source_ingestion_repository


def test_firestore_repositories_round_trip_notebook_source_and_concept_map():
    now = utc_now()
    notebook = Notebook(
        id=new_id(),
        user_id="test-user",
        title="Durable Notebook",
        description="Round-trip repository test",
        created_at=now,
        updated_at=now,
    )
    notebook_repository.create(notebook)

    persisted_notebook = notebook_repository.get_by_id(notebook.id)
    assert persisted_notebook is not None
    assert persisted_notebook.title == "Durable Notebook"
    assert notebook_repository.list_by_user("test-user")[0].id == notebook.id

    source = Source(
        id=new_id(),
        user_id="test-user",
        notebook_id=notebook.id,
        title="Primary Source",
        file_name="source.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_type="docx",
        storage_path=f"sources/test-user/{notebook.id}/source-id/source.docx",
        status=SourceStatus.READY,
        processing_progress=100,
        chunk_count=1,
        file_size_bytes=1234,
        created_at=now,
        updated_at=now,
        processed_at=now,
    )
    source_ingestion_repository.create_source(source)

    chunk = Chunk(
        id=new_id(),
        notebook_id=notebook.id,
        source_id=source.id,
        user_id="test-user",
        order_index=0,
        content="Cellular respiration converts glucose into ATP.",
        token_count=7,
        position=ChunkPosition(page_start=1, page_end=1),
        metadata=ChunkMetadata(),
        created_at=now,
    )
    anchor = CitationAnchor(
        id=new_id(),
        notebook_id=notebook.id,
        source_id=source.id,
        chunk_id=chunk.id,
        source_title=source.title,
        page_start=1,
        page_end=1,
        snippet_text="Cellular respiration converts glucose into ATP.",
        created_at=now,
    )
    source_ingestion_repository.replace_chunks(source.id, [chunk])
    source_ingestion_repository.replace_anchors(source.id, [anchor])

    persisted_source = source_ingestion_repository.get_source(source.id)
    assert persisted_source is not None
    assert persisted_source.storage_path == source.storage_path
    assert source_ingestion_repository.list_sources(notebook.id, "test-user")[0].id == source.id
    assert source_ingestion_repository.list_chunks(source.id)[0].id == chunk.id
    assert source_ingestion_repository.list_anchors(source.id)[0].id == anchor.id

    concept_map = ConceptMap(
        id=new_id(),
        notebook_id=notebook.id,
        user_id="test-user",
        title="Respiration Map",
        source_ids=[source.id],
        generation_status=MapGenerationStatus.READY,
        support_assessment=SupportAssessment.SUPPORTED,
        created_at=now,
        updated_at=now,
        generated_at=now,
    )
    concept_map_repository.create_map(concept_map)

    evidence_ref = ConceptEvidenceReference(
        source_id=source.id,
        source_title=source.title,
        chunk_id=chunk.id,
        citation_anchor_ids=[anchor.id],
        snippet_text=anchor.snippet_text,
        page_start=1,
        page_end=1,
        support=EvidenceSupport.STRONG,
    )
    node = ConceptNode(
        id=new_id(),
        notebook_id=notebook.id,
        concept_map_id=concept_map.id,
        stable_key="cellular-respiration",
        label="Cellular Respiration",
        summary="ATP generation from glucose.",
        support=EvidenceSupport.STRONG,
        uncertain=False,
        needs_refinement=False,
        citation_anchor_ids=[anchor.id],
        evidence_items=[evidence_ref],
        source_ids=[source.id],
        source_coverage_count=1,
        created_by=CreatedBy.AI,
        created_at=now,
        updated_at=now,
    )
    edge = ConceptEdge(
        id=new_id(),
        notebook_id=notebook.id,
        concept_map_id=concept_map.id,
        stable_key="respiration-produces-atp",
        source_node_id=node.id,
        target_node_id=node.id,
        label="produces",
        summary="Respiration produces ATP.",
        support=EvidenceSupport.STRONG,
        uncertain=False,
        needs_refinement=False,
        citation_anchor_ids=[anchor.id],
        evidence_items=[evidence_ref],
        source_ids=[source.id],
        source_coverage_count=1,
        created_by=CreatedBy.AI,
        created_at=now,
        updated_at=now,
    )
    concept_map_repository.create_nodes([node])
    concept_map_repository.create_edges([edge])

    persisted_map = concept_map_repository.get_map(concept_map.id)
    assert persisted_map is not None
    assert persisted_map.title == "Respiration Map"
    assert concept_map_repository.list_maps_for_notebook(notebook.id)[0].id == concept_map.id
    assert concept_map_repository.list_nodes_for_map(concept_map.id)[0].id == node.id
    assert concept_map_repository.list_edges_for_map(concept_map.id)[0].id == edge.id
