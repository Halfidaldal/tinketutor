/**
 * Synthesis Studio — Shared Domain Types
 *
 * These types mirror the backend domain models exactly.
 * Used by the Next.js frontend for type-safe API communication.
 *
 * Aligned to phase-2-technical-architecture-pack.md §6.
 */

// ============================================================
// Enums
// ============================================================

export type SourceStatus = 'uploading' | 'processing' | 'ready' | 'error';
export type FileType = 'pdf' | 'pptx' | 'docx';
export type JobType = 'source_processing' | 'canvas_generation' | 'quiz_generation' | 'gap_analysis';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type NodeType = 'concept' | 'question' | 'evidence' | 'summary' | 'gap_marker';
export type NodeStatus = 'skeleton' | 'student_filled' | 'ai_generated' | 'verified';
export type EdgeStatus = 'skeleton' | 'student_labeled' | 'ai_generated';
export type CreatedBy = 'ai' | 'student';
export type NotebookStatus = 'active' | 'archived';
export type TutorSessionStatus = 'active' | 'completed';
export type TutorMessageType = 'question' | 'hint' | 'challenge' | 'affirmation' | 'redirect' | 'student_response';
export type TutorMessageRole = 'tutor' | 'student';
export type QuestionType = 'mcq' | 'open_ended';
export type Difficulty = 'recall' | 'understanding' | 'application';
export type CitationOutputType = 'canvas_node' | 'tutor_message' | 'quiz_item' | 'gap_result';
export type GapEvidenceType = 'quiz_failure' | 'canvas_empty' | 'tutor_struggle' | 'low_coverage';
export type GapStatus = 'identified' | 'acknowledged' | 'addressed';

// ============================================================
// Identity Context
// ============================================================

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  preferences: {
    language: 'da' | 'en';
  };
  usage: {
    sourcesUploaded: number;
    quizzesTaken: number;
  };
}

// ============================================================
// SourceIngestion Context
// ============================================================

export interface ChunkPosition {
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  chapterTitle: string | null;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
}

export interface Source {
  id: string;
  userId: string;
  notebookId: string;
  title: string;
  fileName: string;
  fileType: FileType;
  status: SourceStatus;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface Chunk {
  id: string;
  sourceId: string;
  content: string;
  tokenCount: number;
  position: ChunkPosition;
}

// ============================================================
// KnowledgeRetrieval Context
// ============================================================

export interface Citation {
  id: string;
  notebookId: string;
  outputType: CitationOutputType;
  outputId: string;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  relevanceScore: number;
}

export interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  score: number;
}

// ============================================================
// SynthesisWorkspace Context
// ============================================================

export interface Notebook {
  id: string;
  userId: string;
  title: string;
  description: string;
  sourceIds: string[];
  status: NotebookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SynthesisNode {
  id: string;
  notebookId: string;
  type: NodeType;
  label: string;
  content: string;
  guidingQuestion: string | null;
  status: NodeStatus;
  positionX: number;
  positionY: number;
  citationIds: string[];
  createdBy: CreatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface SynthesisEdge {
  id: string;
  notebookId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  status: EdgeStatus;
  createdBy: CreatedBy;
  createdAt: string;
}

// ============================================================
// ActiveLearning Context
// ============================================================

export interface TutorSession {
  id: string;
  notebookId: string;
  focusArea: string;
  status: TutorSessionStatus;
  messageCount: number;
  hintLevel: number;
  createdAt: string;
}

export interface TutorMessage {
  id: string;
  sessionId: string;
  role: TutorMessageRole;
  content: string;
  messageType: TutorMessageType;
  citationIds: string[];
  createdAt: string;
}

export interface QuizItem {
  id: string;
  notebookId: string;
  questionType: QuestionType;
  question: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  citationIds: string[];
  difficulty: Difficulty;
  bloomLevel: number;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  notebookId: string;
  quizItemId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeTakenMs: number;
  attemptNumber: number;
  createdAt: string;
}

export interface GapEvidence {
  type: GapEvidenceType;
  referenceId: string;
  detail: string;
}

export interface KnowledgeGap {
  id: string;
  notebookId: string;
  topic: string;
  description: string;
  confidence: number;
  evidence: GapEvidence[];
  sourceIds: string[];
  status: GapStatus;
  createdAt: string;
}

// ============================================================
// Cross-Cutting: Processing Jobs
// ============================================================

export interface ProcessingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
