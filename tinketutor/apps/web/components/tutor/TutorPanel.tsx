'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { CanvasSelectionContext } from '../../lib/concept-map';
import { useI18n } from '../../lib/i18n';
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
  supported: 'evidencePanel.assessmentLabels.supported',
  weak_evidence: 'evidencePanel.assessmentLabels.weak_evidence',
  insufficient_grounding: 'evidencePanel.assessmentLabels.insufficient_grounding',
  no_ready_sources: 'evidencePanel.assessmentLabels.no_ready_sources',
  no_matching_evidence: 'evidencePanel.assessmentLabels.no_matching_evidence',
  missing_traceability: 'evidencePanel.assessmentLabels.missing_traceability',
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
  const { locale, t } = useI18n();
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
          setError(err instanceof Error ? err.message : t('tutorPanel.loadSessionError'));
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
  }, [loadSession, notebookId, t]);

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
          locale,
          sourceIds: readySourceIds,
        }) as { session: TutorSession };
        await loadSession(response.session.id);
      } else {
        await api.tutor.sendTurn(notebookId, session.id, query.trim(), locale);
        await loadSession(session.id);
      }
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tutorPanel.requestError'));
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
      await api.tutor.escalate(notebookId, session.id, { action, locale });
      await loadSession(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tutorPanel.escalationError'));
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
      setError(err instanceof Error ? err.message : t('tutorPanel.citationError'));
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

  const getAssessmentLabel = useCallback((assessment?: string | null) => {
    if (!assessment) {
      return '';
    }
    const key = SUPPORT_LABELS[assessment];
    return key ? t(key) : assessment;
  }, [t]);

  const getEvidenceSupportLabel = useCallback((support: string) => {
    const key = `evidencePanel.supportLabels.${support}`;
    const translated = t(key);
    return translated === key ? support : translated;
  }, [t]);

  async function handleSelectionFocus() {
    if (!selection || !canStart) {
      return;
    }

    const prompt = selection.type === 'node'
      ? t('tutorPanel.selectionFocusNode', { values: { label: selection.node.label } })
      : t('tutorPanel.selectionFocusEdge', {
        values: {
          sourceLabel: selection.sourceLabel,
          label: selection.edge.label,
          targetLabel: selection.targetLabel,
        },
      });

    setSubmitting(true);
    setError(null);
    try {
      if (!session) {
        const response = await api.tutor.startSession(notebookId, {
          query: prompt,
          focusArea: selection.type === 'node' ? selection.node.label : selection.edge.label,
          locale,
          sourceIds: readySourceIds,
        }) as { session: TutorSession };
        await loadSession(response.session.id);
      } else {
        await api.tutor.sendTurn(notebookId, session.id, prompt, locale);
        await loadSession(session.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tutorPanel.focusError'));
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
            {t('tutorPanel.guidedTutor')}
          </span>
          {session && latestTutorTurn && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {getAssessmentLabel(latestTutorTurn.support_assessment || 'supported')}
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
          {t('common.newSession')}
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
              {t('tutorPanel.canvasFocus')}
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
              {selection.type === 'node'
                ? selection.node.label
                : `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              {selection.type === 'node'
                ? selection.node.summary || t('tutorPanel.selectionFallbackNode')
                : selection.edge.summary || t('tutorPanel.selectionFallbackEdge')}
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
              {t('tutorPanel.askAboutSelection')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label
            htmlFor="tutor-query"
            style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}
          >
            {t('tutorPanel.studyQuestion')}
          </label>
          <textarea
            id="tutor-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            placeholder={t('tutorPanel.studyQuestionPlaceholder')}
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
            {submitting ? t('common.working') : session ? t('tutorPanel.continueGuidedStudy') : t('tutorPanel.startGuidedStudy')}
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
            {t('tutorPanel.needReadySource')}
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
              {t('tutorPanel.showMoreHelp')}
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
              {t('tutorPanel.explainDirectly')}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
        {loadingInitial && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            {t('tutorPanel.loadingHistory')}
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
              {t('tutorPanel.howItWorks')}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              {t('tutorPanel.howItWorksBody')}
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
                {t('tutorPanel.nextAction', { values: { value: turn.suggested_next_action } })}
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
                          {t('tutorPanel.pagesLabel', { values: { start: item.page_start, end: item.page_end } })}
                          {item.section_title ? ` | ${item.section_title}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {getEvidenceSupportLabel(item.support)}
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
              {t('tutorPanel.storedCitationDetail')}
            </div>
            {citationLoading && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                {t('tutorPanel.loadCitation')}
              </div>
            )}
            {selectedCitation && !citationLoading && (
              <>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {selectedCitation.citation.source_title}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                  {t('tutorPanel.pagesLabel', {
                    values: {
                      start: selectedCitation.citation.page_start,
                      end: selectedCitation.citation.page_end,
                    },
                  })}
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
