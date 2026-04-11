/**
 * Synthesis Studio — API Request/Response Types
 *
 * Type-safe contracts for all API endpoints.
 */

import type {
  Source, Chunk, Notebook, SynthesisNode, SynthesisEdge,
  TutorSession, TutorMessage, QuizItem, QuizAttempt,
  KnowledgeGap, ProcessingJob, SearchResult, Citation,
  UserProfile,
} from './domain';

// ============================================================
// Source Endpoints
// ============================================================

export interface UploadSourceResponse {
  source: Source;
  jobId: string;
}

export interface ListSourcesResponse {
  sources: Source[];
}

export interface ListChunksResponse {
  chunks: Chunk[];
  total: number;
}

// ============================================================
// Search Endpoints
// ============================================================

export interface SearchRequest {
  query: string;
  sourceIds: string[];
  topK?: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface GetCitationResponse {
  citation: Citation;
  chunk: Chunk;
}

// ============================================================
// Notebook Endpoints
// ============================================================

export interface CreateNotebookRequest {
  title: string;
  description?: string;
}

export interface CreateNotebookResponse {
  notebook: Notebook;
}

export interface ListNotebooksResponse {
  notebooks: Notebook[];
}

export interface GetNotebookResponse {
  notebook: Notebook;
  nodes: SynthesisNode[];
  edges: SynthesisEdge[];
}

export interface GenerateCanvasRequest {
  sourceIds: string[];
}

export interface GenerateCanvasResponse {
  jobId: string;
}

// ============================================================
// Tutor Endpoints
// ============================================================

export interface StartTutorSessionRequest {
  focusArea: string;
  sourceIds: string[];
}

export interface StartTutorSessionResponse {
  session: TutorSession;
  initialMessage: TutorMessage;
}

export interface SendTutorMessageRequest {
  content: string;
}

export interface SendTutorMessageResponse {
  message: TutorMessage;
}

// ============================================================
// Quiz Endpoints
// ============================================================

export interface GenerateQuizRequest {
  sourceIds: string[];
  count?: number;
  difficulty?: string;
}

export interface GenerateQuizResponse {
  jobId: string;
}

export interface ListQuizItemsResponse {
  quizItems: QuizItem[];
}

export interface SubmitQuizAnswerRequest {
  userAnswer: string;
}

export interface SubmitQuizAnswerResponse {
  attempt: QuizAttempt;
  explanation: string;
  citations: Citation[];
}

// ============================================================
// Gap Endpoints
// ============================================================

export interface AnalyzeGapsResponse {
  jobId: string;
}

export interface ListGapsResponse {
  gaps: KnowledgeGap[];
}

// ============================================================
// Job Endpoints
// ============================================================

export interface GetJobResponse {
  job: ProcessingJob;
}

// ============================================================
// User Endpoints
// ============================================================

export interface GetUserResponse {
  user: UserProfile;
}

export interface UpdateUserRequest {
  displayName?: string;
  preferences?: { language: 'da' | 'en' };
}
