'use client';

/**
 * TutorShellPanel — Study Home variant of the workspace TutorPanel.
 *
 * Phase 2: tutor-first shell. This panel leads with the onboarding turn and
 * renders `upload_sources` as a primary CTA button (not a chip) because the
 * empty state is *exactly* when we must not fall back to a disabled chat box.
 *
 * Differences from `components/tutor/TutorPanel.tsx`:
 *   - No `canStart` gate: the textarea is always enabled.
 *   - No focus/selection panel (no canvas context in Study Home).
 *   - Consumes `useTutorSessionController` so state lives in one place.
 *   - Accepts `initialSession` + `initialTurns` so server-bootstrapped turns
 *     render with zero loading flicker.
 */

import Link from 'next/link';
import { FormEvent, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import {
  TUTOR_MAX_MESSAGES,
  buildTutorActionHref,
  type TutorSession,
  type TutorSuggestedAction,
  type TutorSuggestedActionId,
  type TutorTurn,
} from '../../lib/tutor';
import { useTutorSessionController } from '../../lib/tutor-experience/useTutorSessionController';
import TutorMessageCard from '../tutor/TutorMessage';

const SUPPORT_LABELS: Record<string, string> = {
  supported: 'evidencePanel.assessmentLabels.supported',
  weak_evidence: 'evidencePanel.assessmentLabels.weak_evidence',
  insufficient_grounding: 'evidencePanel.assessmentLabels.insufficient_grounding',
  no_ready_sources: 'evidencePanel.assessmentLabels.no_ready_sources',
  no_matching_evidence: 'evidencePanel.assessmentLabels.no_matching_evidence',
  missing_traceability: 'evidencePanel.assessmentLabels.missing_traceability',
};

const PRIMARY_CTA_ACTIONS: TutorSuggestedActionId[] = ['upload_sources'];

interface TutorShellPanelProps {
  notebookId: string;
  studySpaceTitle: string;
  initialSession?: TutorSession | null;
  initialTurns?: TutorTurn[];
  onRenameStudySpace?: () => void;
  onSelectSource?: (sourceId: string) => void;
}

export function TutorShellPanel({
  notebookId,
  studySpaceTitle,
  initialSession = null,
  initialTurns = [],
  onRenameStudySpace,
}: TutorShellPanelProps) {
  const { uiLocale, responseLocale, t } = useI18n();
  const [query, setQuery] = useState('');

  const controller = useTutorSessionController({
    notebookId,
    uiLocale,
    responseLocale,
    initialSession,
    initialTurns,
    autoBootstrap: !initialSession,
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
  } = controller;

  const progressCount = session?.message_count ?? 0;
  const progressPercent = Math.min((progressCount / TUTOR_MAX_MESSAGES) * 100, 100);

  const canEscalate = Boolean(
    session &&
      latestTutorTurn &&
      latestTutorTurn.role === 'tutor' &&
      latestTutorTurn.escalation_available &&
      !latestTutorTurn.insufficient_grounding,
  );

  const primaryActions = latestTutorTurn?.suggested_actions.filter((action) =>
    PRIMARY_CTA_ACTIONS.includes(action.id),
  ) ?? [];
  const secondaryActions = latestTutorTurn?.suggested_actions.filter(
    (action) => !PRIMARY_CTA_ACTIONS.includes(action.id),
  ) ?? [];

  const getAssessmentLabel = (assessment?: string | null) => {
    if (!assessment) {
      return '';
    }
    const key = SUPPORT_LABELS[assessment];
    return key ? t(key) : assessment;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await sendQuery(trimmed);
    if (!controller.error) {
      setQuery('');
    }
  }

  function buildPrimaryCtaCopy(action: TutorSuggestedAction): { label: string; subtitle: string } {
    if (action.id === 'upload_sources') {
      return {
        label: t('tutorExperience.onboarding.uploadCta'),
        subtitle: t('tutorExperience.onboarding.uploadSubtitle'),
      };
    }
    return {
      label: t(`tutorPanel.actionLabels.${action.id}`),
      subtitle: '',
    };
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
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
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {t('tutorExperience.studyHome.studySpaceLabel')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                lineHeight: 1.2,
              }}
            >
              {studySpaceTitle}
            </span>
            {onRenameStudySpace && (
              <button
                type="button"
                onClick={onRenameStudySpace}
                style={{
                  fontSize: '0.6875rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--color-border-secondary)',
                  background: 'transparent',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                {t('tutorExperience.studyHome.renameStudySpace')}
              </button>
            )}
          </div>
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
            {latestTutorTurn?.support_assessment && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                {getAssessmentLabel(latestTutorTurn.support_assessment)}
              </span>
            )}
          </div>
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
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {t('common.newSession')}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '1rem',
          display: 'grid',
          gap: '0.75rem',
        }}
      >
        {loading && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
            {t('tutorExperience.studyHome.loading')}
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

        {turns.map((turn) => (
          <div key={turn.id} style={{ display: 'grid', gap: '0.625rem' }}>
            <TutorMessageCard
              role={turn.role}
              content={turn.message}
              tutorState={turn.tutor_state}
              evidenceItems={turn.evidence_items}
              createdAt={turn.created_at}
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

      {/* Footer / Composer */}
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
        {/* Primary CTA: upload_sources renders as a full-width button, not a chip */}
        {primaryActions.map((action) => {
          const copy = buildPrimaryCtaCopy(action);
          const href = buildTutorActionHref(action.id, notebookId, session?.focus_area);
          return (
            <Link
              key={action.id}
              href={href}
              style={{
                display: 'grid',
                gap: '0.35rem',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-accent-primary)',
                color: '#fff',
                textDecoration: 'none',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{copy.label}</span>
              {copy.subtitle && (
                <span style={{ fontSize: '0.75rem', opacity: 0.9, lineHeight: 1.45 }}>
                  {copy.subtitle}
                </span>
              )}
            </Link>
          );
        })}

        {secondaryActions.length > 0 && (
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
              {secondaryActions.map((action) => (
                <Link
                  key={action.id}
                  href={buildTutorActionHref(action.id, notebookId, session?.focus_area)}
                  style={{
                    padding: '0.45rem 0.7rem',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border-accent)',
                    background: 'var(--color-accent-glow)',
                    color: 'var(--color-accent-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {t(`tutorPanel.actionLabels.${action.id}`)}
                </Link>
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
                cursor: 'pointer',
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
                cursor: 'pointer',
              }}
            >
              {t('tutorPanel.giveMeTheAnswer')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label
            htmlFor="tutor-shell-query"
            style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}
          >
            {t('tutorPanel.studyQuestion')}
          </label>
          <textarea
            id="tutor-shell-query"
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
            style={{
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              opacity: submitting || !query.trim() ? 0.6 : 1,
              border: 'none',
              cursor: submitting || !query.trim() ? 'default' : 'pointer',
            }}
          >
            {submitting
              ? t('common.working')
              : session
                ? t('tutorPanel.continueGuidedStudy')
                : t('tutorPanel.startGuidedStudy')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TutorShellPanel;
