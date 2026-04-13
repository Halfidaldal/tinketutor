'use client';

import { buildTutorMessageParts, type TutorEvidenceItem } from '../../lib/tutor';
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
  evidenceItems = [],
  onCitationClick,
}: {
  role: 'tutor' | 'student';
  content: string;
  tutorState?: string;
  createdAt?: string;
  evidenceItems?: TutorEvidenceItem[];
  onCitationClick?: (citationId: string) => void;
}) {
  const { formatTime, t } = useI18n();
  const isTutor = role === 'tutor';
  const messageParts = buildTutorMessageParts(content, evidenceItems);

  return (
    <article
      className="surface animate-slide-up"
      style={{
        padding: '1.125rem 1.25rem',
        display: 'grid',
        gap: '0.75rem',
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
          {isTutor && evidenceItems.length > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {evidenceItems.length === 1
                ? t('tutorMessage.evidenceOne')
                : t('tutorMessage.evidenceMany', { values: { count: evidenceItems.length } })}
            </span>
          )}
        </div>
        {createdAt && (
          <time style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
            {formatTime(createdAt)}
          </time>
        )}
      </header>

      <div style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
        {messageParts.map((part) => {
          if (part.type === 'text') {
            return <span key={part.key}>{part.value}</span>;
          }

          return (
            <button
              key={part.key}
              type="button"
              onClick={() => onCitationClick?.(part.citationId)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 0.2rem',
                padding: '0.08rem 0.42rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border-accent)',
                background: 'var(--color-accent-glow)',
                color: 'var(--color-accent-primary)',
                fontSize: '0.6875rem',
                fontWeight: 700,
                verticalAlign: 'baseline',
              }}
              title={`${part.evidenceItem.source_title} (${part.evidenceItem.page_start}-${part.evidenceItem.page_end})`}
            >
              {part.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default TutorMessageCard;
