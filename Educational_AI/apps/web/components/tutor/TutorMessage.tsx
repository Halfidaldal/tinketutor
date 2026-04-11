const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  clarify_goal: 'Clarify Goal',
  retrieval_prompt: 'Retrieval Prompt',
  hint_level_1: 'Hint Level 1',
  hint_level_2: 'Hint Level 2',
  evidence_pointing: 'Evidence Pointing',
  self_explanation: 'Self Explanation',
  direct_answer_escalated: 'Direct Answer',
  insufficient_grounding: 'Insufficient Grounding',
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
            {isTutor ? 'Study Guidance' : 'Your Prompt'}
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
              {STATE_LABELS[tutorState] || tutorState}
            </span>
          )}
          {isTutor && evidenceCount > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {evidenceCount} evidence item{evidenceCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {createdAt && (
          <time style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
            {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
