'use client';

import Link from 'next/link';

import { useI18n } from '../lib/i18n';

export default function LandingPage() {
  const { t } = useI18n();
  const features = [
    t('landing.featureSources'),
    t('landing.featureKnowledgeMap'),
    t('landing.featureTutor'),
    t('landing.featureQuiz'),
    t('landing.featureGaps'),
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--color-bg-primary)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '2rem',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#fff',
          }}
        >
          T
        </div>
        <span
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          {t('common.brand')}
        </span>
      </div>

      <h1
        style={{
          fontSize: 'clamp(1.75rem, 4vw, 3rem)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.2,
          maxWidth: '640px',
          margin: '0 0 1rem',
          letterSpacing: '-0.03em',
        }}
      >
        {t('landing.headline')}
      </h1>

      <p
        style={{
          fontSize: '1.125rem',
          color: 'var(--color-text-secondary)',
          maxWidth: '520px',
          marginBottom: '2.5rem',
          lineHeight: 1.7,
        }}
      >
        {t('landing.body')}
      </p>

      <Link
        href="/login"
        id="cta-get-started"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.875rem 2rem',
          background: 'var(--color-accent-primary)',
          color: '#fff',
          borderRadius: 'var(--radius-md)',
          fontSize: '1rem',
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'var(--transition-fast)',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {t('common.getStarted')}
        <span aria-hidden="true">→</span>
      </Link>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginTop: '3rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {features.map((feature) => (
          <span
            key={feature}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            {feature}
          </span>
        ))}
      </div>
    </main>
  );
}
