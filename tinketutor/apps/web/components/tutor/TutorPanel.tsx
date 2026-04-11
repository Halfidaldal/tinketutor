'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import {
  buildTutorActionHref,
  TUTOR_MAX_MESSAGES,
  type TutorSession,
  type TutorSuggestedAction,
  type TutorTurn,
} from '../../lib/tutor';
import type { CitationResolution, WorkspaceFocus } from '../../lib/workspace-focus';
import TutorMessageCard from './TutorMessage';

interface SourceSummary {
  id: string;
  title: string;
  status: string;
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
  focus,
  onFocusChange,
  onWorkspacePaneOpenChange,
}: {
  notebookId: string;
  sources: SourceSummary[];
  focus: WorkspaceFocus;
  onFocusChange: (focus: WorkspaceFocus) => void;
  onWorkspacePaneOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [session, setSession] = useState<TutorSession | null>(null);
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [query, setQuery] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readySourceIds = useMemo(
    () => sources.filter((source) => source.status === 'ready').map((source) => source.id),
    [sources],
  );

  const latestTutorTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === 'tutor') || null,
    [turns],
  );

  const activeFocus = focus && focus.type !== 'citation' ? focus : null;
  const progressCount = session?.message_count ?? 0;
  const progressPercent = Math.min((progressCount / TUTOR_MAX_MESSAGES) * 100, 100);
  const canStart = readySourceIds.length > 0;
  const canEscalate = Boolean(
    session &&
    latestTutorTurn &&
    latestTutorTurn.role === 'tutor' &&
    latestTutorTurn.escalation_available &&
    !latestTutorTurn.insufficient_grounding,
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

  const getAssessmentLabel = useCallback((assessment?: string | null) => {
    if (!assessment) {
      return '';
    }

    const key = SUPPORT_LABELS[assessment];
    return key ? t(key) : assessment;
  }, [t]);

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

  async function handleEscalation(action: 'show_more_help' | 'give_me_the_answer') {
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
      const resolution = await api.search.getCitation(citationId) as CitationResolution;
      onFocusChange({
        type: 'citation',
        citationId,
        resolution,
      });
      onWorkspacePaneOpenChange(true);
      router.push(`/workspace/${notebookId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tutorPanel.citationError'));
    } finally {
      setCitationLoading(false);
    }
  }

  async function handleSelectionFocus() {
    if (!activeFocus || !canStart) {
      return;
    }

    const prompt = activeFocus.type === 'node'
      ? t('tutorPanel.selectionFocusNode', { values: { label: activeFocus.node.label } })
      : t('tutorPanel.selectionFocusEdge', {
        values: {
          sourceLabel: activeFocus.sourceLabel,
          label: activeFocus.edge.label,
          targetLabel: activeFocus.targetLabel,
        },
      });

    setSubmitting(true);
    setError(null);
    try {
      if (!session) {
        const response = await api.tutor.startSession(notebookId, {
          query: prompt,
          focusArea: activeFocus.type === 'node' ? activeFocus.node.label : activeFocus.edge.label,
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

  function handleSuggestedAction(action: TutorSuggestedAction) {
    onWorkspacePaneOpenChange(true);
    router.push(buildTutorActionHref(action.id, notebookId, session?.focus_area));
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        className="glass"
        style={{
          padding: '0.9rem 1rem',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0, display: 'grid', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            {t('tutorPanel.guidedTutor')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '0.18rem 0.48rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent-glow)',
                color: 'var(--color-accent-primary)',
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t(`tutorPanel.modeLabels.${session?.current_mode || 'onboarding'}`)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              {t('tutorPanel.topicLabel')}: {session?.focus_area || t('tutorPanel.noTopic')}
            </span>
          </div>
          {latestTutorTurn?.support_assessment && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {getAssessmentLabel(latestTutorTurn.support_assessment)}
            </span>
          )}
        </div>

        <div style={{ minWidth: 140, display: 'grid', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
            <span>{t('tutorPanel.progressLabel')}</span>
            <span>{t('tutorPanel.progressValue', { values: { current: progressCount, total: TUTOR_MAX_MESSAGES } })}</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-bg-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary))',
                transition: 'width var(--transition-fast)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSession(null);
              setTurns([]);
              setQuery('');
            }}
            style={{
              justifySelf: 'end',
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
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
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
          <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
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
              evidenceItems={turn.evidence_items}
              createdAt={turn.created_at}
              onCitationClick={handleCitationClick}
            />

            {turn.role === 'tutor' && turn.suggested_actions.length === 0 && turn.suggested_next_action && (
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
          </div>
        ))}
      </div>

      <div
        className="glass"
        style={{
          padding: '1rem',
          borderTop: '1px solid var(--color-border-primary)',
          display: 'grid',
          gap: '0.75rem',
          flexShrink: 0,
        }}
      >
        {activeFocus && (
          <div className="surface" style={{ padding: '0.875rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              {t('tutorPanel.canvasFocus')}
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
              {activeFocus.type === 'node'
                ? activeFocus.node.label
                : `${activeFocus.sourceLabel} ${activeFocus.edge.label} ${activeFocus.targetLabel}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              {activeFocus.type === 'node'
                ? activeFocus.node.summary || t('tutorPanel.selectionFallbackNode')
                : activeFocus.edge.summary || t('tutorPanel.selectionFallbackEdge')}
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

        {latestTutorTurn && latestTutorTurn.suggested_actions.length > 0 && (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              {t('tutorPanel.suggestedActions')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {latestTutorTurn.suggested_actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleSuggestedAction(action)}
                  style={{
                    padding: '0.45rem 0.7rem',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border-accent)',
                    background: 'var(--color-accent-glow)',
                    color: 'var(--color-accent-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {t(`tutorPanel.actionLabels.${action.id}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {canEscalate && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
              onClick={() => handleEscalation('give_me_the_answer')}
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
              {t('tutorPanel.giveMeTheAnswer')}
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

        {citationLoading && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            {t('tutorPanel.loadCitation')}
          </div>
        )}

        {!canStart && (
          <div
            className="surface"
            style={{
              padding: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.55,
            }}
          >
            {t('tutorPanel.needReadySource')}
          </div>
        )}
      </div>
    </div>
  );
}

export default TutorPanel;
