'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { CanvasSelectionContext } from '../../lib/concept-map';
import CitationBadge from '../citations/CitationBadge';
import TutorMessageCard from './TutorMessage';
import { api } from '../../lib/api';

interface SourceSummary {
  id: string;
  title: string;
  status: string;
}

interface TutorEvidenceItem {
  source_id: string;
  source_title: string;
  chunk_id: string;
  citation_ids: string[];
  citation_anchor_ids: string[];
  snippet_text: string;
  page_start: number;
  page_end: number;
  section_title?: string | null;
  rank: number;
  score: number;
  support: string;
}

interface TutorTurn {
  id: string;
  session_id: string;
  notebook_id: string;
  role: 'tutor' | 'student';
  message: string;
  tutor_state: string;
  message_type: string;
  user_intent?: string | null;
  escalation_action?: string | null;
  citations: string[];
  evidence_pack_id?: string | null;
  evidence_items: TutorEvidenceItem[];
  escalation_available: boolean;
  follow_up_required: boolean;
  suggested_next_action?: string | null;
  support_assessment?: string | null;
  insufficient_grounding: boolean;
  insufficiency_reason?: string | null;
  language: string;
  created_at: string;
}

interface TutorSession {
  id: string;
  notebook_id: string;
  user_id: string;
  focus_area: string;
  source_ids: string[];
  status: string;
  current_state: string;
  message_count: number;
  hint_level: number;
  language: string;
  last_user_message?: string | null;
  last_evidence_pack_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface CitationResolution {
  citation: {
    id: string;
    source_title: string;
    page_start: number;
    page_end: number;
    section_title?: string | null;
  };
  chunk: {
    content: string;
  };
  citation_anchors: Array<{
    id: string;
    snippet_text: string;
  }>;
}

const SUPPORT_LABELS: Record<string, string> = {
  supported: 'Grounded',
  weak_evidence: 'Weak evidence',
  insufficient_grounding: 'Insufficient grounding',
  no_ready_sources: 'No ready sources',
  no_matching_evidence: 'No matching evidence',
  missing_traceability: 'Traceability incomplete',
};

export function TutorPanel({
  notebookId,
  sources,
  selection,
}: {
  notebookId: string;
  sources: SourceSummary[];
  selection: CanvasSelectionContext;
}) {
  const [session, setSession] = useState<TutorSession | null>(null);
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [query, setQuery] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationResolution | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);

  const readySourceIds = useMemo(
    () => sources.filter((source) => source.status === 'ready').map((source) => source.id),
    [sources]
  );

  const latestTutorTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === 'tutor') || null,
    [turns]
  );

  const loadSession = useCallback(async (sessionId: string) => {
    const response = await api.tutor.getSession(notebookId, sessionId) as {
      session: TutorSession;
      turns: TutorTurn[];
    };
    setSession(response.session);
    setTurns(response.turns);
  }, [notebookId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentSession() {
      setLoadingInitial(true);
      setError(null);
      try {
        const response = await api.tutor.listSessions(notebookId, 1, 'active') as {
          sessions: TutorSession[];
        };
        if (cancelled || response.sessions.length === 0) {
          return;
        }
        await loadSession(response.sessions[0].id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tutor session');
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
      }
    }

    loadRecentSession().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadSession, notebookId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (!session) {
        const response = await api.tutor.startSession(notebookId, {
          query: query.trim(),
          sourceIds: readySourceIds,
        }) as { session: TutorSession };
        await loadSession(response.session.id);
      } else {
        await api.tutor.sendTurn(notebookId, session.id, query.trim());
        await loadSession(session.id);
      }
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tutor request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEscalation(action: 'show_more_help' | 'give_me_the_answer' | 'explain_directly') {
    if (!session) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.tutor.escalate(notebookId, session.id, { action });
      await loadSession(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Escalation failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCitationClick(citationId: string) {
    setCitationLoading(true);
    setError(null);
    try {
      const response = await api.search.getCitation(citationId) as CitationResolution;
      setSelectedCitation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load citation');
    } finally {
      setCitationLoading(false);
    }
  }

  const canStart = readySourceIds.length > 0;
  const canEscalate = Boolean(
    session &&
    latestTutorTurn &&
    latestTutorTurn.role === 'tutor' &&
    latestTutorTurn.escalation_available &&
    !latestTutorTurn.insufficient_grounding
  );

  async function handleSelectionFocus() {
    if (!selection || !canStart) {
      return;
    }

    const prompt = selection.type === 'node'
      ? `Help me understand ${selection.node.label} using only notebook evidence.`
      : `Help me understand the relationship ${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel} using only notebook evidence.`;

    setSubmitting(true);
    setError(null);
    try {
      if (!session) {
        const response = await api.tutor.startSession(notebookId, {
          query: prompt,
          focusArea: selection.type === 'node' ? selection.node.label : selection.edge.label,
          sourceIds: readySourceIds,
        }) as { session: TutorSession };
        await loadSession(response.session.id);
      } else {
        await api.tutor.sendTurn(notebookId, session.id, prompt);
        await loadSession(session.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to focus tutor on selection');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'grid', gap: '0.125rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Guided Tutor
          </span>
          {session && latestTutorTurn && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {SUPPORT_LABELS[latestTutorTurn.support_assessment || 'supported'] || latestTutorTurn.support_assessment}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSession(null);
            setTurns([]);
            setQuery('');
            setSelectedCitation(null);
          }}
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.5rem',
          }}
        >
          New Session
        </button>
      </div>

      <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-primary)' }}>
        {selection && (
          <div
            className="surface"
            style={{
              marginBottom: '0.875rem',
              padding: '0.875rem',
              display: 'grid',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              Canvas Focus
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
              {selection.type === 'node'
                ? selection.node.label
                : `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              {selection.type === 'node'
                ? selection.node.summary || 'Ask the tutor to unpack this concept without leaving notebook evidence.'
                : selection.edge.summary || 'Ask the tutor to unpack this relationship without leaving notebook evidence.'}
            </div>
            <button
              type="button"
              onClick={() => handleSelectionFocus()}
              disabled={submitting || !canStart}
              style={{
                justifySelf: 'start',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                opacity: submitting || !canStart ? 0.6 : 1,
              }}
            >
              Ask Tutor About Selection
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label
            htmlFor="tutor-query"
            style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}
          >
            Study Question
          </label>
          <textarea
            id="tutor-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            placeholder="Ask a notebook-scoped study question. The tutor will guide before answering."
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-secondary)',
              background: 'var(--color-bg-surface)',
              color: 'var(--color-text-primary)',
              fontSize: '0.8125rem',
              lineHeight: 1.55,
            }}
          />
          <button
            type="submit"
            disabled={submitting || !query.trim() || !canStart}
            style={{
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              opacity: submitting || !query.trim() || !canStart ? 0.6 : 1,
            }}
          >
            {submitting ? 'Working...' : session ? 'Continue Guided Study' : 'Start Guided Study'}
          </button>
        </form>

        {!canStart && (
          <div
            className="surface"
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.55,
            }}
          >
            Upload at least one ready source before starting a tutor session.
          </div>
        )}

        {canEscalate && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleEscalation('show_more_help')}
              disabled={submitting}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-secondary)',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Show More Help
            </button>
            <button
              type="button"
              onClick={() => handleEscalation('explain_directly')}
              disabled={submitting}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-warning-bg)',
                border: '1px solid var(--color-warning)',
                fontSize: '0.75rem',
                color: 'var(--color-warning)',
              }}
            >
              Explain Directly
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
        {loadingInitial && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            Loading tutor history...
          </div>
        )}

        {error && (
          <div
            className="surface"
            style={{
              padding: '0.875rem',
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              fontSize: '0.75rem',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {!loadingInitial && turns.length === 0 && !error && (
          <div
            className="surface"
            style={{
              padding: '0.9375rem',
              display: 'grid',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-secondary)' }}>
              How this works
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              The tutor is notebook-scoped. It starts with a prompt or hint, points you back to cited passages, and only gives a direct answer after an explicit escalation.
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} style={{ display: 'grid', gap: '0.625rem' }}>
            <TutorMessageCard
              role={turn.role}
              content={turn.message}
              tutorState={turn.tutor_state}
              evidenceCount={turn.evidence_items.length}
              createdAt={turn.created_at}
            />

            {turn.role === 'tutor' && turn.suggested_next_action && (
              <div
                style={{
                  padding: '0 0.125rem',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-tertiary)',
                  lineHeight: 1.5,
                }}
              >
                Next action: {turn.suggested_next_action}
              </div>
            )}

            {turn.role === 'tutor' && turn.insufficient_grounding && turn.insufficiency_reason && (
              <div
                className="surface"
                style={{
                  padding: '0.75rem',
                  borderColor: 'var(--color-warning)',
                  background: 'var(--color-warning-bg)',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.55,
                }}
              >
                {turn.insufficiency_reason}
              </div>
            )}

            {turn.role === 'tutor' && turn.evidence_items.length > 0 && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {turn.evidence_items.map((item) => (
                  <div key={`${turn.id}-${item.chunk_id}`} className="surface" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {item.source_title}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                          Pages {item.page_start}-{item.page_end}
                          {item.section_title ? ` | ${item.section_title}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {item.support}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                      {item.snippet_text}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {item.citation_ids.map((citationId) => (
                        <CitationBadge
                          key={citationId}
                          sourceTitle={item.source_title}
                          pageStart={item.page_start}
                          pageEnd={item.page_end}
                          onClick={() => handleCitationClick(citationId)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {(citationLoading || selectedCitation) && (
          <div className="surface" style={{ padding: '0.875rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Stored Citation Detail
            </div>
            {citationLoading && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                Loading citation...
              </div>
            )}
            {selectedCitation && !citationLoading && (
              <>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {selectedCitation.citation.source_title}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                  Pages {selectedCitation.citation.page_start}-{selectedCitation.citation.page_end}
                  {selectedCitation.citation.section_title ? ` | ${selectedCitation.citation.section_title}` : ''}
                </div>
                {selectedCitation.citation_anchors[0]?.snippet_text && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                    {selectedCitation.citation_anchors[0].snippet_text}
                  </div>
                )}
                <div
                  style={{
                    maxHeight: 180,
                    overflow: 'auto',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-surface)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedCitation.chunk.content}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TutorPanel;
