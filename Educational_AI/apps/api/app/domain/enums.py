"""
Domain Enums

Shared enumerations used across bounded contexts.
Aligned to phase-2-technical-architecture-pack.md §6.
"""

from enum import Enum


class SourceStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class FileType(str, Enum):
    PDF = "pdf"
    PPTX = "pptx"
    DOCX = "docx"


class JobType(str, Enum):
    SOURCE_PROCESSING = "source_processing"
    CANVAS_GENERATION = "canvas_generation"
    QUIZ_GENERATION = "quiz_generation"
    GAP_ANALYSIS = "gap_analysis"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class NodeType(str, Enum):
    CONCEPT = "concept"
    QUESTION = "question"
    EVIDENCE = "evidence"
    SUMMARY = "summary"
    GAP_MARKER = "gap_marker"


class NodeStatus(str, Enum):
    SKELETON = "skeleton"
    STUDENT_FILLED = "student_filled"
    AI_GENERATED = "ai_generated"
    VERIFIED = "verified"


class EdgeStatus(str, Enum):
    SKELETON = "skeleton"
    STUDENT_LABELED = "student_labeled"
    AI_GENERATED = "ai_generated"


class CreatedBy(str, Enum):
    AI = "ai"
    STUDENT = "student"


class NotebookStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TutorSessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


class TutorState(str, Enum):
    IDLE = "idle"
    CLARIFY_GOAL = "clarify_goal"
    RETRIEVAL_PROMPT = "retrieval_prompt"
    HINT_LEVEL_1 = "hint_level_1"
    HINT_LEVEL_2 = "hint_level_2"
    EVIDENCE_POINTING = "evidence_pointing"
    SELF_EXPLANATION = "self_explanation"
    DIRECT_ANSWER_ESCALATED = "direct_answer_escalated"
    INSUFFICIENT_GROUNDING = "insufficient_grounding"


class TutorMessageType(str, Enum):
    QUESTION = "question"
    HINT = "hint"
    CHALLENGE = "challenge"
    AFFIRMATION = "affirmation"
    REDIRECT = "redirect"
    DIRECT_ANSWER = "direct_answer"
    STUDENT_RESPONSE = "student_response"


class TutorMessageRole(str, Enum):
    TUTOR = "tutor"
    STUDENT = "student"


class TutorUserIntent(str, Enum):
    UNDERSTAND_TOPIC = "understand_topic"
    CLARIFY_REQUEST = "clarify_request"
    REQUEST_EVIDENCE = "request_evidence"
    REQUEST_MORE_HELP = "request_more_help"
    REQUEST_DIRECT_ANSWER = "request_direct_answer"
    SELF_EXPLANATION = "self_explanation"


class TutorEscalationAction(str, Enum):
    SHOW_MORE_HELP = "show_more_help"
    GIVE_ME_THE_ANSWER = "give_me_the_answer"
    EXPLAIN_DIRECTLY = "explain_directly"


class QuestionType(str, Enum):
    MCQ = "mcq"
    OPEN_ENDED = "open_ended"


class Difficulty(str, Enum):
    RECALL = "recall"
    UNDERSTANDING = "understanding"
    APPLICATION = "application"


class CitationOutputType(str, Enum):
    RETRIEVAL_RESULT = "retrieval_result"
    CANVAS_NODE = "canvas_node"
    CANVAS_EDGE = "canvas_edge"
    TUTOR_MESSAGE = "tutor_message"
    QUIZ_ITEM = "quiz_item"
    GAP_RESULT = "gap_result"


class GapFindingType(str, Enum):
    WEAK_CONCEPT = "weak_concept"
    UNCERTAIN_RELATIONSHIP = "uncertain_relationship"
    MISSING_PREREQUISITE = "missing_prerequisite"
    SOURCE_TENSION = "source_tension"
    QUIZ_MISSED_CONCEPT = "quiz_missed_concept"
    LOW_SUPPORT_AREA = "low_support_area"


class SuggestedTarget(str, Enum):
    CANVAS_NODE = "canvas_node"
    CANVAS_EDGE = "canvas_edge"
    TUTOR = "tutor"
    QUIZ = "quiz"
    EVIDENCE = "evidence"


class GapStatus(str, Enum):
    IDENTIFIED = "identified"
    ACKNOWLEDGED = "acknowledged"
    ADDRESSED = "addressed"


class Language(str, Enum):
    DA = "da"
    EN = "en"
    UNKNOWN = "unknown"


class RetrievalMode(str, Enum):
    LEXICAL = "lexical"
    VECTOR = "vector"
    HYBRID = "hybrid"


class SupportAssessment(str, Enum):
    SUPPORTED = "supported"
    WEAK_EVIDENCE = "weak_evidence"
    INSUFFICIENT_GROUNDING = "insufficient_grounding"
    NO_READY_SOURCES = "no_ready_sources"
    NO_MATCHING_EVIDENCE = "no_matching_evidence"
    MISSING_TRACEABILITY = "missing_traceability"


class EvidenceSupport(str, Enum):
    STRONG = "strong"
    PARTIAL = "partial"
    WEAK = "weak"


class MapGenerationStatus(str, Enum):
    IDLE = "idle"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
