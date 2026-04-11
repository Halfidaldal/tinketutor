'use client';

import { useI18n } from '../../lib/i18n';

const STATE_LABELS: Record<string, string> = {
  idle: 'tutorMessage.stateLabels.idle',
  clarify_goal: 'tutorMessage.stateLabels.clarify_goal',
  retrieval_prompt: 'tutorMessage.stateLabels.retrieval_prompt',
  hint_level_1: 'tutorMessage.stateLabels.hint_level_1',
  hint_level_2: 'tutorMessage.stateLabels.hint_level_2',
  evidence_pointing: 'tutorMessage.stateLabels.evidence_pointing',
  self_explanation: 'tutorMessage.stateLabels.self_explanation',
  direct_answer_escalated: 'tutorMessage.stateLabels.direct_answer_escalated',
  insufficient_grounding: 'tutorMessage.stateLabels.insufficient_grounding',
};

export function TutorMessageCard({
  role,
  content,
  tutorState,
  createdAt,
  evidenceCount = 0,
}: {
  role: 'tutor' | 'student';
  content: string;
  tutorState?: string;
  createdAt?: string;
  evidenceCount?: number;
}) {
  const { formatTime, t } = useI18n();
  const isTutor = role === 'tutor';

  return (
    <article
      className="surface"
      style={{
        padding: '0.9375rem',
        display: 'grid',
        gap: '0.625rem',
        borderLeft: `3px solid ${isTutor ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isTutor ? 'var(--color-accent-secondary)' : 'var(--color-text-secondary)',
            }}
          >
            {isTutor ? t('tutorMessage.studyGuidance') : t('tutorMessage.yourPrompt')}
          </span>
          {isTutor && tutorState && (
            <span
              style={{
                padding: '0.1875rem 0.4375rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '0.6875rem',
                fontWeight: 600,
              }}
            >
              {t(STATE_LABELS[tutorState] || tutorState)}
            </span>
          )}
          {isTutor && evidenceCount > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {evidenceCount === 1
                ? t('tutorMessage.evidenceOne')
                : t('tutorMessage.evidenceMany', { values: { count: evidenceCount } })}
            </span>
          )}
        </div>
        {createdAt && (
          <time style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
            {formatTime(createdAt)}
          </time>
        )}
      </header>

      <div style={{ fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    </article>
  );
}

export default TutorMessageCard;
