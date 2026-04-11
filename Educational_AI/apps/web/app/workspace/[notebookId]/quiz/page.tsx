'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import QuizCard from '@/components/quiz/QuizCard';
import { api, QuizItemDTO } from '@/lib/api';

import { useWorkspace } from '../layout';

interface JobPayload {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  error_message?: string | null;
  result?: {
    batch_id?: string | null;
    topic?: string | null;
  } | null;
}

export default function QuizPage() {
  const params = useParams<{ notebookId: string }>();
  const searchParams = useSearchParams();
  const { sources } = useWorkspace();

  const notebookId = params.notebookId;
  const topicParam = searchParams.get('topic')?.trim() || '';
  const shouldAutostart = searchParams.get('autostart') === '1';
  const readySourceIds = sources.filter((source) => source.status === 'ready').map((source) => source.id);
  const hasReadySources = readySourceIds.length > 0;

  const [items, setItems] = useState<QuizItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [resultsByItem, setResultsByItem] = useState<Record<string, boolean>>({});
  const autoStartKeyRef = useRef<string | null>(null);

  const fetchItems = useCallback(async (preferredBatchId?: string | null) => {
    try {
      setLoading(true);
      setListError(null);
      const response = await api.quiz.list(notebookId);
      const nextItems = response.quizItems || [];
      setItems(nextItems);
      setActiveBatchId((current) => {
        if (preferredBatchId && nextItems.some((item) => item.batch_id === preferredBatchId)) {
          return preferredBatchId;
        }
        if (current && nextItems.some((item) => item.batch_id === current)) {
          return current;
        }
        return nextItems.length > 0 ? nextItems[nextItems.length - 1].batch_id ?? null : null;
      });
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Failed to load quiz items');
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  const handleGenerate = useCallback(async (topic?: string) => {
    if (!hasReadySources) {
      setGenerationError('Upload and process at least one source before generating a quiz.');
      return;
    }

    try {
      setGenerationError(null);
      setGenerating(true);
      setJobProgress(0);
      setResultsByItem({});
      setActiveBatchId(null);
      const response = await api.quiz.generate(notebookId, {
        sourceIds: readySourceIds,
        count: 5,
        topic: topic || undefined,
      });
      setGenerationJobId(response.jobId);
    } catch (error) {
      setGenerating(false);
      setGenerationJobId(null);
      setGenerationError(error instanceof Error ? error.message : 'Failed to start quiz generation');
    }
  }, [hasReadySources, notebookId, readySourceIds]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!generationJobId) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.jobs.get(generationJobId) as { job: JobPayload };
        if (cancelled) {
          return;
        }

        const job = response.job;
        setJobProgress(job.progress ?? 0);

        if (job.status === 'completed') {
          window.clearInterval(intervalId);
          setGenerating(false);
          setGenerationJobId(null);
          const nextBatchId = job.result?.batch_id || job.id;
          await fetchItems(nextBatchId);
          return;
        }

        if (job.status === 'failed') {
          window.clearInterval(intervalId);
          setGenerating(false);
          setGenerationJobId(null);
          setGenerationError(job.error_message || 'Quiz generation failed');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        window.clearInterval(intervalId);
        setGenerating(false);
        setGenerationJobId(null);
        setGenerationError(error instanceof Error ? error.message : 'Failed to poll quiz generation');
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [fetchItems, generationJobId]);

  useEffect(() => {
    if (!shouldAutostart || !topicParam || !hasReadySources) {
      return;
    }

    const autoStartKey = `${notebookId}:${topicParam}`;
    if (autoStartKeyRef.current === autoStartKey) {
      return;
    }

    autoStartKeyRef.current = autoStartKey;
    void handleGenerate(topicParam);
  }, [handleGenerate, hasReadySources, notebookId, shouldAutostart, topicParam]);

  const activeItems = useMemo(() => {
    if (!activeBatchId) {
      return items.filter((item) => !item.batch_id);
    }
    return items.filter((item) => item.batch_id === activeBatchId);
  }, [activeBatchId, items]);

  const visibleItems = generating ? [] : activeItems;
  const answeredCount = visibleItems.filter((item) => Object.prototype.hasOwnProperty.call(resultsByItem, item.id)).length;
  const correctCount = visibleItems.filter((item) => resultsByItem[item.id] === true).length;
  const activeTopic = topicParam || visibleItems[0]?.topic || null;

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'grid', gap: '0.9rem' }}>
        <div className="surface" style={{ padding: '1.35rem' }}>
          <div className="skeleton-loading" style={{ width: 180, height: 24, marginBottom: '0.75rem' }} />
          <div className="skeleton-loading" style={{ width: '100%', height: 16, marginBottom: '0.4rem' }} />
          <div className="skeleton-loading" style={{ width: '75%', height: 16 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.35rem 1.5rem 2rem', maxWidth: 860, margin: '0 auto', display: 'grid', gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.3rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            Quiz
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Generate notebook-scoped questions with exact citations and review each answer against the supporting source material.
          </p>
          {activeTopic && (
            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-tertiary)' }}>
              Focus topic: <strong style={{ color: 'var(--color-text-primary)' }}>{activeTopic}</strong>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleGenerate(topicParam || undefined)}
          disabled={!hasReadySources || generating}
          style={{
            padding: '0.58rem 0.9rem',
            background: hasReadySources && !generating ? 'var(--color-accent-primary)' : 'var(--color-bg-hover)',
            color: hasReadySources && !generating ? '#fff' : 'var(--color-text-tertiary)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: hasReadySources && !generating ? 'pointer' : 'not-allowed',
          }}
        >
          {generating ? `Generating ${jobProgress}%` : activeTopic ? 'Generate Focused Quiz' : 'Generate Quiz'}
        </button>
      </div>

      {listError && (
        <div
          style={{
            padding: '0.85rem 0.95rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            fontSize: '0.8rem',
            lineHeight: 1.5,
          }}
        >
          {listError}
        </div>
      )}

      {generationError && (
        <div
          style={{
            padding: '0.85rem 0.95rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            fontSize: '0.8rem',
            lineHeight: 1.5,
          }}
        >
          {generationError}
        </div>
      )}

      {generating && (
        <div className="surface" style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {activeTopic ? `Generating a focused quiz on “${activeTopic}”` : 'Generating a notebook quiz'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            Evidence retrieval is notebook-scoped and citation-preserving. The page will update automatically when the batch is ready.
          </div>
          <div
            style={{
              marginTop: '0.25rem',
              width: '100%',
              height: 8,
              borderRadius: 999,
              background: 'var(--color-bg-hover)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(jobProgress, 6)}%`,
                height: '100%',
                background: 'var(--color-accent-primary)',
                transition: 'width 160ms ease',
              }}
            />
          </div>
        </div>
      )}

      {!hasReadySources && (
        <div className="surface" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.45rem' }}>
            Upload notebook sources first
          </div>
          <p style={{ maxWidth: 460, margin: '0 auto', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.65 }}>
            Quiz generation only starts once at least one source is processed and ready for notebook-scoped retrieval.
          </p>
        </div>
      )}

      {hasReadySources && !generating && visibleItems.length === 0 && (
        <div className="surface" style={{ padding: '2.1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.45rem' }}>
            {activeTopic ? `No quiz batch yet for “${activeTopic}”` : 'No quiz batch yet'}
          </div>
          <p style={{ maxWidth: 500, margin: '0 auto', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.65 }}>
            {activeTopic
              ? 'Generate a focused batch to turn this gap into a short targeted quiz.'
              : 'Generate a quiz to test your current understanding against the notebook evidence.'}
          </p>
        </div>
      )}

      {visibleItems.length > 0 && (
        <>
          <div
            className="surface"
            style={{
              padding: '1rem 1.05rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: '0.2rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Batch Summary
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {correctCount}/{visibleItems.length} correct
              </div>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              {answeredCount}/{visibleItems.length} answered
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {visibleItems.map((item) => (
              <QuizCard
                key={item.id}
                notebookId={notebookId}
                quizItemId={item.id}
                question={item.question}
                questionType={item.question_type}
                options={item.options}
                difficulty={item.difficulty}
                onAnswered={(quizItemId, isCorrect) => {
                  setResultsByItem((current) => ({
                    ...current,
                    [quizItemId]: isCorrect,
                  }));
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
