import { useState } from 'react';
import { api } from '@/lib/api';

interface QuizFeedback {
  attempt: {
    id: string;
    is_correct: boolean;
  };
  result: 'correct' | 'partially_correct' | 'incorrect' | string;
  explanation: string;
  correct_answer?: string | null;
  matched_concepts?: string[];
  citations?: Array<{
    id: string;
    source_title: string;
  }>;
}

export function QuizCard({
  notebookId,
  quizItemId,
  question,
  questionType,
  options,
  difficulty,
  onAnswered,
}: {
  notebookId: string;
  quizItemId: string;
  question: string;
  questionType: 'mcq' | 'open_ended';
  options?: string[] | null;
  difficulty: string;
  onAnswered?: (quizItemId: string, isCorrect: boolean) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const difficultyColors: Record<string, string> = {
    recall: 'var(--color-success)',
    understanding: 'var(--color-warning)',
    application: 'var(--color-error)',
  };

  const handleSubmit = async (submitValue?: string) => {
    const val = submitValue ?? answer;
    if (!val.trim()) return;
    try {
      setSubmitting(true);
      setSubmitError(null);
      const res = await api.quiz.submit(notebookId, quizItemId, val);
      setFeedback(res);
      onAnswered?.(quizItemId, Boolean(res.attempt?.is_correct));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '0.125rem 0.5rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: difficultyColors[difficulty] || 'var(--color-text-tertiary)',
          background: difficultyColors[difficulty] ? `var(--color-bg-elevated)` : 'var(--color-bg-elevated)', // Fallback opacity could be injected 
          borderColor: difficultyColors[difficulty],
          borderWidth: 1,
          borderStyle: "solid",
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          marginBottom: '0.75rem',
        }}
      >
        {difficulty} ({questionType})
      </div>

      <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginBottom: '1rem', lineHeight: 1.6 }}>
        {question}
      </div>

      {!feedback ? (
        <>
          {questionType === 'mcq' && options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {options.map((option, i) => (
                <button
                  key={i}
                  disabled={submitting}
                  onClick={() => handleSubmit(option)}
                  style={{
                    textAlign: 'left',
                    padding: '0.625rem 1rem',
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border-secondary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.875rem',
                    color: 'var(--color-text-primary)',
                    transition: 'var(--transition-fast)',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 600, marginRight: '0.5rem', color: 'var(--color-text-tertiary)' }}>
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {option}
                </button>
              ))}
            </div>
          )}

          {questionType === 'open_ended' && (
            <div>
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                rows={3}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-secondary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={submitting || !answer.trim()}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: submitting || !answer.trim() ? 'var(--color-bg-hover)' : 'var(--color-accent-primary)',
                  color: submitting || !answer.trim() ? 'var(--color-text-tertiary)' : '#fff',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: submitting || !answer.trim() ? 'not-allowed' : 'pointer'
                }}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
          )}

          {submitError && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                fontSize: '0.78rem',
                lineHeight: 1.5,
              }}
            >
              {submitError}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-secondary)' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', 
            color: (feedback.result === 'correct' || feedback.result === 'partially_correct') ? 'var(--color-success)' : 'var(--color-error)' 
          }}>
            {feedback.result.replace('_', ' ').toUpperCase()} 
          </div>
          
          <div style={{ fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
            <p style={{ margin: 0 }}><strong>Explanation:</strong> {feedback.explanation}</p>
          </div>

          {feedback.correct_answer && (
             <div style={{ fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
               <p style={{ margin: 0 }}><strong>Target Answer:</strong> {feedback.correct_answer}</p>
             </div>
          )}

          {(feedback.matched_concepts?.length ?? 0) > 0 && (
             <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
               <p style={{ margin: 0 }}><strong>Matches:</strong> {(feedback.matched_concepts ?? []).join(", ")}</p>
             </div>
          )}

          {(feedback.citations?.length ?? 0) > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {(feedback.citations ?? []).map((citation) => (
                <span key={citation.id} style={{ fontSize: '0.65rem', padding: '0.125rem 0.25rem', background: 'var(--color-border-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
                  [{citation.source_title}]
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QuizCard;
