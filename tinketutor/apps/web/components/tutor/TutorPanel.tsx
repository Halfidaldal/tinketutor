'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import {
  buildTutorActionHref,
  TUTOR_MAX_MESSAGES,
  type TutorSuggestedAction,
} from '../../lib/tutor';
import { useTutorSessionController } from '../../lib/tutor-experience/useTutorSessionController';
import type { CitationResolution, WorkspaceFocus } from '../../lib/workspace-focus';
import TutorMessageCard from './TutorMessage';

const SUPPORT_LABELS: Record<string, string> = {
  supported: 'evidencePanel.assessmentLabels.supported',
  weak_evidence: 'evidencePanel.assessmentLabels.weak_evidence',
  insufficient_grounding: 'evidencePanel.assessmentLabels.insufficient_grounding',
  no_ready_sources: 'evidencePanel.assessmentLabels.no_ready_sources',
  no_matching_evidence: 'evidencePanel.assessmentLabels.no_matching_evidence',
  missing_traceability: 'evidencePanel.assessmentLabels.missing_traceability',
};

interface TutorPanelSource {
  id: string;
  title: string;
  status: string;
}

export function TutorPanel({
  notebookId,
  focus,
  onFocusChange,
  onWorkspacePaneOpenChange,
  selectedSourceIds,
}: {
  notebookId: string;
  /** Workspace passes ready-source metadata; the panel no longer gates on it
   *  (Phase 2 removes the empty-state lockout) but the prop stays so callers
   *  do not need to drop it from the existing layout wiring. */
  sources?: TutorPanelSource[];
  focus: WorkspaceFocus;
  onFocusChange: (focus: WorkspaceFocus) => void;
  onWorkspacePaneOpenChange: (open: boolean) => void;
  /** Selected source IDs to scope tutor sessions to user-chosen sources. */
  selectedSourceIds?: string[];
}) {
  const router = useRouter();
  const { uiLocale, responseLocale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [citationLoading, setCitationLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const controller = useTutorSessionController({
    notebookId,
    uiLocale,
    responseLocale,
    autoBootstrap: true,
    translateError: (key) => {
      switch (key) {
        case 'loadSession':
          return t('tutorPanel.loadSessionError');
        case 'escalation':
          return t('tutorPanel.escalationError');
        case 'request':
        default:
          return t('tutorPanel.requestError');
      }
    },
  });

  const {
    session,
    turns,
    loading,
    submitting,
    error,
    latestTutorTurn,
    sendQuery,
    escalate,
    reset,
    setError,
  } = controller;

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns]);

  const activeFocus = focus && focus.type !== 'citation' ? focus : null;
  const progressCount = session?.message_count ?? 0;
  const progressPercent = Math.min((progressCount / TUTOR_MAX_MESSAGES) * 100, 100);
  const canEscalate = Boolean(
    session &&
      latestTutorTurn &&
      latestTutorTurn.role === 'tutor' &&
      latestTutorTurn.escalation_available &&
      !latestTutorTurn.insufficient_grounding,
  );

  const getAssessmentLabel = useCallback(
    (assessment?: string | null) => {
      if (!assessment) {
        return '';
      }

      const key = SUPPORT_LABELS[assessment];
      return key ? t(key) : assessment;
    },
    [t],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await sendQuery(trimmed, { sourceIds: selectedSourceIds });
    if (!controller.error) {
      setQuery('');
    }
  }

  async function handleCitationClick(citationId: string) {
    setCitationLoading(true);
    setError(null);
    try {
      const resolution = (await api.search.getCitation(citationId)) as CitationResolution;
      onFocusChange({
        type: 'citation',
        citationId,
        resolution,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tutorPanel.citationError'));
    } finally {
      setCitationLoading(false);
    }
  }

  async function handleSelectionFocus() {
    if (!activeFocus) {
      return;
    }

    const prompt =
      activeFocus.type === 'node'
        ? t('tutorPanel.selectionFocusNode', { values: { label: activeFocus.node.label } })
        : t('tutorPanel.selectionFocusEdge', {
            values: {
              sourceLabel: activeFocus.sourceLabel,
              label: activeFocus.edge.label,
              targetLabel: activeFocus.targetLabel,
            },
          });

    const focusArea =
      activeFocus.type === 'node' ? activeFocus.node.label : activeFocus.edge.label;
    await sendQuery(prompt, { focusArea, sourceIds: selectedSourceIds });
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.75rem',
              fontSize: '0.6875rem',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span>{t('tutorPanel.progressLabel')}</span>
            <span>
              {t('tutorPanel.progressValue', {
                values: { current: progressCount, total: TUTOR_MAX_MESSAGES },
              })}
            </span>
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
                background:
                  'linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary))',
                transition: 'width var(--transition-fast)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
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

      <div
        ref={scrollRef}
        className="tutor-conversation-area"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '1.25rem',
          display: 'grid',
          gap: '0.875rem',
        }}
      >
        {loading && (
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

        {!loading && turns.length === 0 && !error && (
          <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-secondary)',
              }}
            >
              {t('tutorPanel.howItWorks')}
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.65,
              }}
            >
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

            {turn.role === 'tutor' &&
              turn.suggested_actions.length === 0 &&
              turn.suggested_next_action && (
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
            <div
              style={{
                fontSize: '0.6875rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('tutorPanel.canvasFocus')}
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                lineHeight: 1.45,
              }}
            >
              {activeFocus.type === 'node'
                ? activeFocus.node.label
                : `${activeFocus.sourceLabel} ${activeFocus.edge.label} ${activeFocus.targetLabel}`}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.55,
              }}
            >
              {activeFocus.type === 'node'
                ? activeFocus.node.summary || t('tutorPanel.selectionFallbackNode')
                : activeFocus.edge.summary || t('tutorPanel.selectionFallbackEdge')}
            </div>
            <button
              type="button"
              onClick={() => handleSelectionFocus()}
              disabled={submitting}
              style={{
                justifySelf: 'start',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {t('tutorPanel.askAboutSelection')}
            </button>
          </div>
        )}

        {latestTutorTurn && latestTutorTurn.suggested_actions.length > 0 && (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <div
              style={{
                fontSize: '0.6875rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
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
              onClick={() => escalate('show_more_help')}
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
              onClick={() => escalate('give_me_the_answer')}
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
            disabled={submitting || !query.trim()}
            className="btn-cta"
            style={{
              width: '100%',
              opacity: submitting || !query.trim() ? 0.6 : 1,
            }}
          >
            {submitting
              ? t('common.working')
              : session
                ? t('tutorPanel.continueGuidedStudy')
                : t('tutorPanel.startGuidedStudy')}
          </button>
        </form>

        {citationLoading && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            {t('tutorPanel.loadCitation')}
          </div>
        )}
      </div>
    </div>
  );
}

export default TutorPanel;
