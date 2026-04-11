/**
 * Landing Page — Root redirect to login or dashboard
 *
 * Per product contract: Entry point shows
 * "Turn your study materials into an active exam-prep workspace."
 */

import Link from 'next/link';

export default function LandingPage() {
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
      {/* Logo / Wordmark */}
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
          S
        </div>
        <span
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Synthesis Studio
        </span>
      </div>

      {/* Headline */}
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
        Turn your study materials into an active exam-prep workspace
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
        Upload your PDFs and slides. Get a concept map with intentional gaps
        to fill, a Socratic tutor that never gives away answers, and quizzes
        grounded in your actual sources.
      </p>

      {/* CTA */}
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
        Get Started
        <span aria-hidden="true">→</span>
      </Link>

      {/* Feature Chips */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginTop: '3rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          '📄 Upload Sources',
          '🧠 Concept Maps',
          '🎓 Socratic Tutor',
          '📝 Smart Quizzes',
          '🔍 Gap Analysis',
        ].map((feature) => (
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
