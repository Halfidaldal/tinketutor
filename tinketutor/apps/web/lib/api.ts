'use client';

/**
 * API Client
 *
 * Centralized HTTP client for talking to the FastAPI backend.
 * All endpoints are typed using shared types from packages/types.
 */

import { getCurrentIdToken } from './firebase';

export const REQUIRED_API_PUBLIC_ENV = ['NEXT_PUBLIC_API_URL'] as const;

const LOCAL_API_BASE = 'http://localhost:5055/api/v1';

function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return LOCAL_API_BASE;
  }

  throw new Error(
    'Missing NEXT_PUBLIC_API_URL. Set it to the deployed backend origin, including /api/v1.',
  );
}

const API_BASE = resolveApiBase();

export interface TutorLocaleOptions {
  /** Locale driving the application UI (`t()` lookups, formatting). */
  uiLocale?: string;
  /** Locale the tutor should respond in. Defaults to `uiLocale` on the server. */
  responseLocale?: string;
  /** Legacy single-locale field; forwarded for backward compatibility. */
  locale?: string;
}

function serializeLocales(locales?: TutorLocaleOptions): Record<string, string> {
  if (!locales) {
    return {};
  }
  const payload: Record<string, string> = {};
  if (locales.locale) payload.locale = locales.locale;
  if (locales.uiLocale) payload.uiLocale = locales.uiLocale;
  if (locales.responseLocale) payload.responseLocale = locales.responseLocale;
  return payload;
}

export interface QuizItemDTO {
  id: string;
  notebook_id: string;
  batch_id?: string | null;
  topic?: string | null;
  source_ids: string[];
  question_type: 'mcq' | 'open_ended';
  question: string;
  options?: string[] | null;
  correct_answer: string;
  explanation: string;
  citation_ids: string[];
  difficulty: string;
  bloom_level: number;
  created_at: string;
}

export interface QuizSubmissionDTO {
  attempt: {
    id: string;
    is_correct: boolean;
  };
  result: 'correct' | 'partially_correct' | 'incorrect' | string;
  matched_concepts?: string[];
  missing_concepts?: string[];
  explanation: string;
  citations?: Array<{
    id: string;
    source_title: string;
  }>;
  correct_answer?: string | null;
}

export interface GapEvidenceDTO {
  type: 'canvas_empty' | 'quiz_failure' | 'low_coverage' | string;
  reference_id: string;
  detail: string;
}

export interface GapFindingDTO {
  id: string;
  topic: string;
  description: string;
  confidence: number;
  evidence: GapEvidenceDTO[];
  source_ids: string[];
  severity: 'low' | 'medium' | 'high';
  linked_node_ids: string[];
  linked_edge_ids: string[];
  linked_quiz_ids: string[];
  suggested_target?: 'canvas_node' | 'canvas_edge' | 'quiz' | 'tutor' | 'evidence' | null;
  suggested_next_action?: string | null;
}

export interface GapReportDTO {
  id: string;
  finding_count?: number;
  diagnostics?: Record<string, unknown>;
}

export interface JobDTO {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  error_message?: string | null;
  result?: Record<string, unknown> | null;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const token = await getCurrentIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `API error: ${response.status}`);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  return response.json();
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getCurrentIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `API error: ${response.status}`);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  return response.json();
}

/** API methods organized by bounded context */
export const api = {
  // --- Health ---
  health: () => apiFetch<{ status: string }>('/health'),
  ready: () => apiFetch<{ status: string; checks: Record<string, string> }>('/ready'),

  // --- Sources (SourceIngestion) ---
  sources: {
    upload: (formData: FormData) =>
      apiUpload(`/sources`, formData),

    list: (notebookId: string) =>
      apiFetch(`/sources`, { params: { notebookId } }),

    get: (sourceId: string) =>
      apiFetch(`/sources/${sourceId}`),

    getStatus: (sourceId: string) =>
      apiFetch(`/sources/${sourceId}/status`),

    reprocess: (sourceId: string) =>
      apiFetch(`/sources/${sourceId}/reprocess`, { method: 'POST' }),

    delete: (sourceId: string) =>
      apiFetch(`/sources/${sourceId}`, { method: 'DELETE' }),

    listChunks: (sourceId: string, page = 1, limit = 20) =>
      apiFetch(`/sources/${sourceId}/chunks`, {
        params: { page: String(page), limit: String(limit) },
      }),
  },

  // --- Search (KnowledgeRetrieval) ---
  search: {
    query: (payload: {
      notebookId: string;
      query: string;
      sourceIds?: string[];
      topK?: number;
    }) =>
      apiFetch('/search', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getEvidencePack: (payload: {
      notebookId: string;
      query: string;
      sourceIds?: string[];
      topK?: number;
    }) =>
      apiFetch('/evidence-packs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getCitation: (citationId: string) =>
      apiFetch(`/citations/${citationId}`),

    getChunk: (chunkId: string) =>
      apiFetch(`/chunks/${chunkId}`),

    getCitationAnchor: (anchorId: string) =>
      apiFetch(`/citation-anchors/${anchorId}`),

    getReadiness: (notebookId: string) =>
      apiFetch(`/notebooks/${notebookId}/retrieval-readiness`),
  },

  // --- Notebooks (SynthesisWorkspace) ---
  notebooks: {
    create: (title: string, description = '') =>
      apiFetch('/notebooks', {
        method: 'POST',
        body: JSON.stringify({ title, description }),
      }),

    bootstrap: (locales?: TutorLocaleOptions) =>
      apiFetch<{
        notebook: {
          id: string;
          title: string;
          description: string;
          source_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        created: boolean;
      }>(`/notebooks/bootstrap`, {
        method: 'POST',
        body: JSON.stringify(serializeLocales(locales)),
      }),

    list: () => apiFetch('/notebooks'),

    get: (notebookId: string) =>
      apiFetch(`/notebooks/${notebookId}`),

    update: (notebookId: string, data: { title?: string; description?: string }) =>
      apiFetch(`/notebooks/${notebookId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (notebookId: string) =>
      apiFetch(`/notebooks/${notebookId}`, { method: 'DELETE' }),

    generateCanvas: (notebookId: string, sourceIds: string[]) =>
      apiFetch(`/notebooks/${notebookId}/generate-canvas`, {
        method: 'POST',
        body: JSON.stringify({ sourceIds }),
      }),

    createNode: (notebookId: string, node: Record<string, unknown>) =>
      apiFetch(`/notebooks/${notebookId}/nodes`, {
        method: 'POST',
        body: JSON.stringify(node),
      }),

    updateNode: (notebookId: string, nodeId: string, data: Record<string, unknown>) =>
      apiFetch(`/notebooks/${notebookId}/nodes/${nodeId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    createEdge: (notebookId: string, edge: Record<string, unknown>) =>
      apiFetch(`/notebooks/${notebookId}/edges`, {
        method: 'POST',
        body: JSON.stringify(edge),
      }),
  },

  conceptMaps: {
    generate: (notebookId: string, sourceIds: string[] = []) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps`, {
        method: 'POST',
        body: JSON.stringify({ sourceIds }),
      }),

    getLatest: (notebookId: string) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/latest`),

    getById: (notebookId: string, conceptMapId: string) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/${conceptMapId}`),

    inspectNode: (notebookId: string, conceptMapId: string, nodeId: string) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/${conceptMapId}/nodes/${nodeId}`),

    updateNode: (
      notebookId: string,
      conceptMapId: string,
      nodeId: string,
      data: Record<string, unknown>
    ) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/${conceptMapId}/nodes/${nodeId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    inspectEdge: (notebookId: string, conceptMapId: string, edgeId: string) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/${conceptMapId}/edges/${edgeId}`),

    updateEdge: (
      notebookId: string,
      conceptMapId: string,
      edgeId: string,
      data: Record<string, unknown>
    ) =>
      apiFetch(`/notebooks/${notebookId}/concept-maps/${conceptMapId}/edges/${edgeId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  // --- Tutor (ActiveLearning) ---
  tutor: {
    startSession: (notebookId: string, payload: {
      query?: string;
      focusArea?: string;
      sourceIds?: string[];
      intent?: string;
    } & TutorLocaleOptions) => {
      const { query, focusArea, sourceIds, intent, ...locales } = payload;
      const body: Record<string, unknown> = { ...serializeLocales(locales) };
      if (query !== undefined) body.query = query;
      if (focusArea !== undefined) body.focusArea = focusArea;
      if (sourceIds !== undefined) body.sourceIds = sourceIds;
      if (intent !== undefined) body.intent = intent;
      return apiFetch(`/notebooks/${notebookId}/tutor/sessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    bootstrapSession: (notebookId: string, locales?: TutorLocaleOptions) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions/bootstrap`, {
        method: 'POST',
        body: JSON.stringify(serializeLocales(locales)),
      }),

    listSessions: (notebookId: string, limit = 5, status?: string) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions`, {
        params: {
          limit: String(limit),
          ...(status ? { status } : {}),
        },
      }),

    getSession: (notebookId: string, sessionId: string) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions/${sessionId}`),

    listTurns: (notebookId: string, sessionId: string, limit = 20) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions/${sessionId}/turns`, {
        params: { limit: String(limit) },
      }),

    sendTurn: (
      notebookId: string,
      sessionId: string,
      content: string,
      locales?: TutorLocaleOptions,
    ) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions/${sessionId}/turns`, {
        method: 'POST',
        body: JSON.stringify({ content, ...serializeLocales(locales) }),
      }),

    sendMessage: (
      notebookId: string,
      sessionId: string,
      content: string,
      locales?: TutorLocaleOptions,
    ) =>
      apiFetch(`/notebooks/${notebookId}/tutor/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, ...serializeLocales(locales) }),
      }),

    escalate: (notebookId: string, sessionId: string, payload: {
      action: 'show_more_help' | 'give_me_the_answer' | 'explain_directly';
      content?: string;
    } & TutorLocaleOptions) => {
      const { action, content, ...locales } = payload;
      return apiFetch(`/notebooks/${notebookId}/tutor/sessions/${sessionId}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ action, content, ...serializeLocales(locales) }),
      });
    },
  },

  // --- Quiz (ActiveLearning) ---
  quiz: {
    generate: (
      notebookId: string,
      payload: {
        sourceIds?: string[];
        count?: number;
        difficulty?: string;
        topic?: string;
      } = {},
    ) =>
      apiFetch<{ jobId: string }>(`/notebooks/${notebookId}/quizzes/generate`, {
        method: 'POST',
        body: JSON.stringify({
          sourceIds: payload.sourceIds || [],
          count: payload.count ?? 5,
          difficulty: payload.difficulty ?? null,
          topic: payload.topic ?? null,
        }),
      }),

    list: (notebookId: string) =>
      apiFetch<{ quizItems: QuizItemDTO[] }>(`/notebooks/${notebookId}/quizzes`),

    submit: (notebookId: string, quizItemId: string, userAnswer: string) =>
      apiFetch<QuizSubmissionDTO>(`/notebooks/${notebookId}/quizzes/${quizItemId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ userAnswer }),
      }),
  },

  // --- Gaps (ActiveLearning) ---
  gaps: {
    analyze: (notebookId: string) =>
      apiFetch<{ jobId: string }>(`/notebooks/${notebookId}/gaps/analyze`, { method: 'POST' }),

    getLatestReport: (notebookId: string) =>
      apiFetch<{ report: GapReportDTO | null; findings: GapFindingDTO[] }>(`/notebooks/${notebookId}/gaps`),
  },

  // --- Jobs ---
  jobs: {
    get: (jobId: string) => apiFetch<{ job: JobDTO }>(`/jobs/${jobId}`),
  },

  // --- Users ---
  users: {
    me: () => apiFetch('/users/me'),
    update: (data: Record<string, unknown>) =>
      apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
};
