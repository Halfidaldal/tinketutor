'use client';

import { useI18n } from '../../../../lib/i18n';
import { useWorkspace } from '../layout';

export default function TutorPage() {
  const { t } = useI18n();
  const { sources } = useWorkspace();
  const readySources = sources.filter((source) => source.status === 'ready');

  return (
    <div style={{ padding: '2rem', maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.375rem', fontWeight: 600, margin: '0 0 0.375rem' }}>
          {t('tutorPage.title')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0 }}>
          {t('tutorPage.body')}
        </p>
      </div>

      <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.625rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-secondary)' }}>
          {t('tutorPage.currentReadiness')}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
          {readySources.length > 0
            ? (readySources.length === 1
              ? t('tutorPage.readySourcesOne')
              : t('tutorPage.readySourcesMany', { values: { count: readySources.length } }))
            : t('tutorPage.readySourcesNone')}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {t('tutorPage.readinessBody')}
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-secondary)' }}>
          {t('tutorPage.guidanceLadder')}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          {t('tutorPage.step1')}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          {t('tutorPage.step2')}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          {t('tutorPage.step3')}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          {t('tutorPage.step4')}
        </div>
      </div>
    </div>
  );
}
