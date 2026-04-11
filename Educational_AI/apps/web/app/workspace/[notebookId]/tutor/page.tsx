'use client';

import { useWorkspace } from '../layout';

export default function TutorPage() {
  const { sources } = useWorkspace();
  const readySources = sources.filter((source) => source.status === 'ready');

  return (
    <div style={{ padding: '2rem', maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.375rem', fontWeight: 600, margin: '0 0 0.375rem' }}>
          Socratic Tutor
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Use the study support panel on the right to ask a notebook-scoped question. The tutor starts with a prompt, points you to evidence, and only gives a direct answer after explicit escalation.
        </p>
      </div>

      <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.625rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-secondary)' }}>
          Current Readiness
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
          {readySources.length > 0
            ? `${readySources.length} ready source${readySources.length !== 1 ? 's are' : ' is'} available for guided tutoring.`
            : 'No ready sources are available yet.'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          The tutor will refuse to overstate confidence when the notebook lacks traceable support. Evidence and citations remain visible in the right rail for every grounded tutor turn.
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-secondary)' }}>
          Guidance Ladder
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          1. Clarify the goal or anchor the question in the notebook.
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          2. Offer a first hint, then a stronger hint only when asked.
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          3. Point back to the evidence and ask for your own explanation.
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          4. Give a direct answer only after explicit escalation and only when the notebook supports it.
        </div>
      </div>
    </div>
  );
}
