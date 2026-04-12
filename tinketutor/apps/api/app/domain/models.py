"""
Domain Models — Pydantic schemas for all 16 entities.

Aligned to phase-2-technical-architecture-pack.md §6 (Data Model Proposal).
These models are used for:
- API request/response serialization
- Firestore document mapping
- Internal service communication

Entity ownership follows bounded context boundaries:
- SourceIngestion: Source, Chunk, ChunkPosition, ChunkMetadata
- KnowledgeRetrieval: Citation, EvidencePack, EvidenceChunk
- SynthesisWorkspace: Notebook, SynthesisNode, SynthesisEdge
- ActiveLearning: TutorSession, TutorMessage, QuizItem, QuizAttempt, KnowledgeGap, GapEvidence
- Cross-cutting: ProcessingJob
- Identity: UserProfile
"""

from __future__ import annotations

from datetime import datetime
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

from app.domain.enums import (
    SourceStatus, FileType, JobType, JobStatus,
    NodeType, NodeStatus, EdgeStatus, CreatedBy,
    NotebookStatus, TutorMode, TutorSessionStatus, TutorState,
    TutorMessageType, TutorMessageRole, TutorUserIntent,
    TutorEscalationAction, QuestionType, Difficulty,
    CitationOutputType, GapStatus, Language,
    RetrievalMode, SupportAssessment, EvidenceSupport,
    MapGenerationStatus, GapFindingType, SuggestedTarget,
)


# ============================================================
# Identity Context
# ============================================================


class UserPreferences(BaseModel):
    language: Language = Language.EN


class UserUsage(BaseModel):
    sources_uploaded: int = 0
    quizzes_taken: int = 0


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    usage: UserUsage = Field(default_factory=UserUsage)


# ============================================================
# SourceIngestion Context
# ============================================================


class ChunkPosition(BaseModel):
    page_start: int
    page_end: int
    section_title: str | None = None
    chapter_title: str | None = None
    paragraph_index: int = 0
    char_start: int = 0
    char_end: int = 0


class ChunkMetadata(BaseModel):
    language: Language = Language.UNKNOWN
    has_table: bool = False
    has_image: bool = False
    hierarchy_path: list[str] = Field(default_factory=list)


class Source(BaseModel):
    id: str
    user_id: str
    notebook_id: str
    title: str
    file_name: str
    mime_type: str
    file_type: FileType
    storage_path: str
    parser_type: str | None = None
    status: SourceStatus = SourceStatus.UPLOADED
    processing_progress: int = 0
    chunk_count: int = 0
    error_message: str | None = None
    file_size_bytes: int = 0
    last_job_id: str | None = None
    created_at: datetime
    updated_at: datetime
    processing_started_at: datetime | None = None
    processed_at: datetime | None = None


class Chunk(BaseModel):
    id: str
    notebook_id: str
    source_id: str
    user_id: str
    order_index: int = 0
    content: str
    token_count: int
    embedding: list[float] = Field(default_factory=list)
    position: ChunkPosition
    metadata: ChunkMetadata = Field(default_factory=ChunkMetadata)
    created_at: datetime


# ============================================================
# KnowledgeRetrieval Context
# ============================================================


class Citation(BaseModel):
    id: str
    notebook_id: str
    output_type: CitationOutputType
    output_id: str
    chunk_id: str
    source_id: str
    source_title: str  # denormalized for display
    page_start: int
    page_end: int
    section_title: str | None = None
    relevance_score: float = 0.0
    created_at: datetime


class CitationAnchor(BaseModel):
    id: str
    notebook_id: str
    source_id: str
    chunk_id: str
    source_title: str
    parser_type: str | None = None
    page_start: int
    page_end: int
    section_title: str | None = None
    char_start: int = 0
    char_end: int = 0
    snippet_text: str
    order_index: int = 0
    created_at: datetime


@dataclass
class EvidenceChunk:
    """In-memory data contract — not persisted. See phase-2-implementation-seams.md §Seam 7."""
    chunk_id: str
    source_id: str
    source_title: str
    content: str
    snippet_text: str
    page_start: int
    page_end: int
    section_title: str | None
    citation_anchor_ids: list[str] = field(default_factory=list)
    citation_ids: list[str] = field(default_factory=list)
    score: float = 0.0
    rank: int = 0
    support: EvidenceSupport = EvidenceSupport.WEAK
    keyword_score: float = 0.0
    vector_score: float = 0.0


@dataclass
class EvidencePack:
    """
    Universal contract between KnowledgeRetrieval and all generation services.
    Canvas, tutor, quiz, and gap services all receive an EvidencePack.
    See phase-2-implementation-seams.md §Seam 7.
    """
    id: str = ""
    query: str = ""
    chunks: list[EvidenceChunk] = field(default_factory=list)
    source_ids: list[str] = field(default_factory=list)
    notebook_id: str = ""
    retrieval_mode: RetrievalMode = RetrievalMode.LEXICAL
    support_assessment: SupportAssessment = SupportAssessment.INSUFFICIENT_GROUNDING
    insufficient_grounding: bool = False
    insufficiency_reason: str | None = None
    generated_at: datetime | None = None
    diagnostics: dict = field(default_factory=dict)


# ============================================================
# SynthesisWorkspace Context
# ============================================================


class Notebook(BaseModel):
    id: str
    user_id: str
    title: str
    description: str = ""
    source_ids: list[str] = Field(default_factory=list)
    status: NotebookStatus = NotebookStatus.ACTIVE
    created_at: datetime
    updated_at: datetime


class SynthesisNode(BaseModel):
    id: str
    notebook_id: str
    type: NodeType
    label: str
    content: str = ""
    guiding_question: str | None = None
    status: NodeStatus = NodeStatus.AI_GENERATED
    position_x: float = 0.0
    position_y: float = 0.0
    citation_ids: list[str] = Field(default_factory=list)
    created_by: CreatedBy = CreatedBy.AI
    created_at: datetime
    updated_at: datetime


class SynthesisEdge(BaseModel):
    id: str
    notebook_id: str
    source_node_id: str
    target_node_id: str
    label: str = ""
    status: EdgeStatus = EdgeStatus.AI_GENERATED
    created_by: CreatedBy = CreatedBy.AI
    created_at: datetime


class ConceptEvidenceReference(BaseModel):
    source_id: str
    source_title: str
    chunk_id: str
    citation_ids: list[str] = Field(default_factory=list)
    citation_anchor_ids: list[str] = Field(default_factory=list)
    snippet_text: str
    page_start: int
    page_end: int
    section_title: str | None = None
    rank: int = 0
    score: float = 0.0
    support: EvidenceSupport = EvidenceSupport.WEAK


class ConceptMap(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    title: str
    source_ids: list[str] = Field(default_factory=list)
    generation_status: MapGenerationStatus = MapGenerationStatus.IDLE
    generation_strategy: str = "deterministic_lexical_v1"
    support_assessment: SupportAssessment = SupportAssessment.INSUFFICIENT_GROUNDING
    insufficient_grounding: bool = False
    insufficiency_reason: str | None = None
    diagnostics: dict = Field(default_factory=dict)
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    generated_at: datetime | None = None


class ConceptNode(BaseModel):
    id: str
    notebook_id: str
    concept_map_id: str
    stable_key: str
    label: str
    summary: str = ""
    note: str = ""
    guiding_question: str | None = None
    status: NodeStatus = NodeStatus.AI_GENERATED
    support: EvidenceSupport = EvidenceSupport.WEAK
    uncertain: bool = True
    needs_refinement: bool = True
    citation_ids: list[str] = Field(default_factory=list)
    citation_anchor_ids: list[str] = Field(default_factory=list)
    evidence_items: list[ConceptEvidenceReference] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    source_coverage_count: int = 0
    editable: bool = True
    created_by: CreatedBy = CreatedBy.AI
    position_x: float = 0.0
    position_y: float = 0.0
    created_at: datetime
    updated_at: datetime


class ConceptEdge(BaseModel):
    id: str
    notebook_id: str
    concept_map_id: str
    stable_key: str
    source_node_id: str
    target_node_id: str
    label: str
    summary: str = ""
    support: EvidenceSupport = EvidenceSupport.WEAK
    uncertain: bool = True
    needs_refinement: bool = True
    citation_ids: list[str] = Field(default_factory=list)
    citation_anchor_ids: list[str] = Field(default_factory=list)
    evidence_items: list[ConceptEvidenceReference] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    source_coverage_count: int = 0
    editable: bool = True
    created_by: CreatedBy = CreatedBy.AI
    created_at: datetime
    updated_at: datetime


# ============================================================
# ActiveLearning Context
# ============================================================


class TutorSession(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    focus_area: str
    source_ids: list[str] = Field(default_factory=list)
    status: TutorSessionStatus = TutorSessionStatus.ACTIVE
    current_mode: TutorMode = TutorMode.ONBOARDING
    current_state: TutorState = TutorState.IDLE
    message_count: int = 0  # user-authored turns only; tutor turns do not consume the cap
    hint_level: int = 0
    language: Language = Language.UNKNOWN
    last_user_message: str | None = None
    last_evidence_pack_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TutorEvidenceReference(BaseModel):
    source_id: str
    source_title: str
    chunk_id: str
    citation_ids: list[str] = Field(default_factory=list)
    citation_anchor_ids: list[str] = Field(default_factory=list)
    snippet_text: str
    page_start: int
    page_end: int
    section_title: str | None = None
    rank: int = 0
    score: float = 0.0
    support: EvidenceSupport = EvidenceSupport.WEAK


class TutorSuggestedAction(BaseModel):
    id: Literal[
        "open_sources",
        "open_knowledge_map",
        "open_quiz",
        "upload_sources",
    ]
    kind: Literal["navigate"] = "navigate"


class TutorTurn(BaseModel):
    id: str
    session_id: str
    notebook_id: str
    role: TutorMessageRole
    content: str
    tutor_state: TutorState
    message_type: TutorMessageType
    user_intent: TutorUserIntent | None = None
    escalation_action: TutorEscalationAction | None = None
    citation_ids: list[str] = Field(default_factory=list)
    evidence_pack_id: str | None = None
    evidence_items: list[TutorEvidenceReference] = Field(default_factory=list)
    escalation_available: bool = False
    follow_up_required: bool = False
    suggested_next_action: str | None = None
    suggested_actions: list[TutorSuggestedAction] = Field(default_factory=list)
    support_assessment: SupportAssessment | None = None
    insufficient_grounding: bool = False
    insufficiency_reason: str | None = None
    language: Language = Language.UNKNOWN
    created_at: datetime


class TutorMessage(BaseModel):
    """Legacy tutor message schema retained for compatibility with earlier phases."""
    id: str
    session_id: str
    role: TutorMessageRole
    content: str
    message_type: TutorMessageType
    citation_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class QuizItem(BaseModel):
    id: str
    notebook_id: str
    batch_id: str | None = None
    topic: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    question_type: QuestionType
    question: str
    options: list[str] | None = None  # for MCQ
    correct_answer: str
    explanation: str
    citation_ids: list[str] = Field(default_factory=list)
    difficulty: Difficulty = Difficulty.RECALL
    bloom_level: int = 1  # 1-6
    created_at: datetime


class QuizAttempt(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    quiz_item_id: str
    user_answer: str
    is_correct: bool
    time_taken_ms: int = 0
    attempt_number: int = 1
    created_at: datetime


class GapReport(BaseModel):
    id: str
    notebook_id: str
    user_id: str
    status: JobStatus = JobStatus.QUEUED
    concept_map_id: str | None = None
    support_assessment: SupportAssessment = SupportAssessment.INSUFFICIENT_GROUNDING
    diagnostics: dict = Field(default_factory=dict)
    finding_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None


class GapEvidence(BaseModel):
    type: str
    reference_id: str
    detail: str


class GapFinding(BaseModel):
    id: str
    notebook_id: str
    gap_report_id: str
    finding_type: GapFindingType
    topic: str
    description: str
    confidence: float = 0.0
    evidence: list[GapEvidence] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    title: str | None = None
    severity: str = "medium"  # low, medium, high
    support: EvidenceSupport = EvidenceSupport.WEAK
    uncertain: bool = True
    citation_ids: list[str] = Field(default_factory=list)
    citation_anchor_ids: list[str] = Field(default_factory=list)
    linked_node_ids: list[str] = Field(default_factory=list)
    linked_edge_ids: list[str] = Field(default_factory=list)
    linked_quiz_ids: list[str] = Field(default_factory=list)
    suggested_target: SuggestedTarget | None = None
    suggested_next_action: str | None = None
    suggested_study_mode: str | None = None
    language: Language = Language.UNKNOWN
    created_at: datetime


# ============================================================
# Cross-Cutting: Processing Jobs
# ============================================================


class ProcessingJob(BaseModel):
    id: str
    user_id: str
    notebook_id: str | None = None
    source_id: str | None = None
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    target_id: str
    stage: str = "queued"
    progress: int = 0  # 0-100
    result: dict | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    updated_at: datetime
    completed_at: datetime | None = None


class SourceProcessingJob(ProcessingJob):
    type: JobType = JobType.SOURCE_PROCESSING
    source_id: str
    notebook_id: str


# ============================================================
# LLM Provider Response Types
# ============================================================


class LLMResponse(BaseModel):
    """Standard response from LLMProvider.generate()."""
    content: str
    model: str
    usage: dict = Field(default_factory=dict)  # token counts
    raw: dict = Field(default_factory=dict)  # provider-specific metadata


class GenerationConfig(BaseModel):
    """Configuration for LLM generation calls."""
    temperature: float = 0.7
    max_tokens: int = 4096
    response_format: str | None = None  # "json" for structured output
    stop_sequences: list[str] = Field(default_factory=list)


# ============================================================
# Parser Types
# ============================================================


class ParsedSection(BaseModel):
    """A section extracted from a parsed document."""
    title: str | None = None
    content: str
    page_start: int
    page_end: int
    level: int = 0  # heading level (1 = top, 2 = sub, etc.)


class ParsedDocument(BaseModel):
    """Output of ParserProvider.parse()."""
    title: str
    sections: list[ParsedSection] = Field(default_factory=list)
    raw_text: str = ""
    page_count: int = 0
    metadata: dict = Field(default_factory=dict)


# ============================================================
# Vector Store Types
# ============================================================


@dataclass
class ChunkWithEmbedding:
    """Input to VectorStore.store_embeddings()."""
    chunk_id: str
    source_id: str
    embedding: list[float]


@dataclass
class ScoredChunk:
    """Output from VectorStore.search()."""
    chunk_id: str
    source_id: str
    score: float
