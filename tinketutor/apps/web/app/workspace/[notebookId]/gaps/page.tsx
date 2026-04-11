'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import GapFindingCard from '@/components/gaps/GapFindingCard';
import { api, GapFindingDTO } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

import { useWorkspace } from '../layout';

interface JobPayload {
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  error_message?: string | null;
}

interface GapReportDTO {
  id: string;
  finding_count?: number;
  diagnostics?: Record<string, unknown>;
}

export default function GapsPage() {
  const params = useParams<{ notebookId: string }>();
  const router = useRouter();
  const { sources } = useWorkspace();
  const { t } = useI18n();

  const notebookId = params.notebookId;
  const hasReadySources = sources.some((source) => source.status === 'ready');

  const [report, setReport] = useState<GapReportDTO | null>(null);
  const [findings, setFindings] = useState<GapFindingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.gaps.getLatestReport(notebookId);
      setReport(data.report);
      setFindings(data.findings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('gapsPage.loadError'));
    } finally {
      setLoading(false);
    }
  }, [notebookId, t]);

  useEffect(() => {
    void loadGaps();
  }, [loadGaps]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.jobs.get(jobId) as { job: JobPayload };
        if (cancelled) {
          return;
        }

        const job = response.job;
        setJobProgress(job.progress ?? 0);

        if (job.status === 'completed') {
          window.clearInterval(intervalId);
          setGenerating(false);
          setJobId(null);
          await loadGaps();
          return;
        }

        if (job.status === 'failed') {
          window.clearInterval(intervalId);
          setGenerating(false);
          setJobId(null);
          setError(job.error_message || t('gapsPage.analysisFailed'));
        }
      } catch (pollError) {
        if (cancelled) {
          return;
        }
        window.clearInterval(intervalId);
        setGenerating(false);
        setJobId(null);
        setError(pollError instanceof Error ? pollError.message : t('gapsPage.pollError'));
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [jobId, loadGaps, t]);

  const runAnalysis = async () => {
    if (!hasReadySources) {
      setError(t('gapsPage.needSource'));
      return;
    }

    try {
      setError(null);
      setGenerating(true);
      setJobProgress(0);
      const response = await api.gaps.analyze(notebookId);
      setJobId(response.jobId);
    } catch (analysisError) {
      setGenerating(false);
      setJobId(null);
      setError(analysisError instanceof Error ? analysisError.message : t('gapsPage.analysisError'));
    }
  };

  const handleStartQuiz = (topic: string) => {
    const params = new URLSearchParams({
      topic,
      autostart: '1',
    });
    router.push(`/workspace/${notebookId}/quiz?${params.toString()}`);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'grid', gap: '0.9rem' }}>
        <div className="surface" style={{ padding: '1.35rem' }}>
          <div className="skeleton-loading" style={{ width: 220, height: 24, marginBottom: '0.75rem' }} />
          <div className="skeleton-loading" style={{ width: '100%', height: 16, marginBottom: '0.4rem' }} />
          <div className="skeleton-loading" style={{ width: '70%', height: 16 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '1.35rem 1.5rem 2rem', display: 'grid', gap: '1rem' }}>
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            {t('gapsPage.title')}
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {t('gapsPage.body')}
          </p>
          {report && (
            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-tertiary)' }}>
              {findings.length === 1
                ? t('gapsPage.latestReportOne')
                : t('gapsPage.latestReportMany', { values: { count: findings.length } })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={generating}
          style={{
            padding: '0.58rem 0.92rem',
            background: generating ? 'var(--color-bg-hover)' : 'var(--color-accent-primary)',
            color: generating ? 'var(--color-text-tertiary)' : '#fff',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating
            ? t('gapsPage.analyzingProgress', { values: { progress: jobProgress } })
            : t('gapsPage.runAnalysis')}
        </button>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      {!hasReadySources && (
        <div className="surface" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.45rem' }}>
            {t('gapsPage.uploadFirstTitle')}
          </div>
          <p style={{ maxWidth: 480, margin: '0 auto', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.65 }}>
            {t('gapsPage.uploadFirstBody')}
          </p>
        </div>
      )}

      {generating && (
        <div className="surface" style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {t('gapsPage.analyzingTitle')}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            {t('gapsPage.analyzingBody')}
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

      {!report && !generating && hasReadySources && (
        <div className="surface" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.45rem' }}>
            {t('gapsPage.noReportTitle')}
          </div>
          <p style={{ maxWidth: 480, margin: '0 auto', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.65 }}>
            {t('gapsPage.noReportBody')}
          </p>
        </div>
      )}

      {report && findings.length === 0 && !generating && (
        <div className="surface" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.45rem' }}>
            {t('gapsPage.noGapsTitle')}
          </div>
          <p style={{ maxWidth: 500, margin: '0 auto', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.65 }}>
            {t('gapsPage.noGapsBody')}
          </p>
        </div>
      )}

      {findings.length > 0 && !generating && (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {findings.map((finding) => (
            <GapFindingCard
              key={finding.id}
              finding={finding}
              notebookId={notebookId}
              onStartQuiz={handleStartQuiz}
            />
          ))}
        </div>
      )}
    </div>
  );
}
