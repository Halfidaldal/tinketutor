'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { useAuth, useRedirectAuthenticated } from '../../../lib/hooks';
import { useI18n } from '../../../lib/i18n';

function LoginPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get('next') || '/study', [searchParams]);
  const { loading: redirectLoading } = useRedirectAuthenticated('/study');
  const { authenticateWithEmail, clearError, error, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    clearError();
    try {
      await signInWithGoogle();
      router.replace(nextPath);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    clearError();
    try {
      await authenticateWithEmail(email, password, authMode);
      router.replace(nextPath);
    } finally {
      setSubmitting(false);
    }
  };

  if (redirectLoading) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="surface" style={{ padding: '1.5rem 2rem', fontSize: '0.9375rem' }}>
          {t('auth.checkingSession')}
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-primary)',
        padding: '2rem',
      }}
    >
      <div
        className="surface animate-slide-up"
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '2.5rem',
        }}
      >
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: 'var(--color-text-primary)',
          }}
        >
          {t('auth.welcomeBack')}
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '2rem',
          }}
        >
          {t('auth.workspaceSubtitle')}
        </p>

        <button
          id="btn-google-signin"
          type="button"
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontSize: '0.9375rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            transition: 'var(--transition-fast)',
            marginBottom: '1.5rem',
            opacity: submitting ? 0.7 : 1,
          }}
          onClick={handleGoogleSignIn}
          disabled={submitting}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {t('auth.continueWithGoogle')}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--color-border-primary)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('common.or')}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border-primary)' }} />
        </div>

        <form onSubmit={handleEmailAuth}>
          {error && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                fontSize: '0.8125rem',
              }}
            >
              {error}
            </div>
          )}

          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
          >
            {t('common.email')}
          </label>
          <input
            id="email"
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              fontSize: '0.9375rem',
              marginBottom: '1rem',
              outline: 'none',
            }}
          />

          <label
            htmlFor="password"
            style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}
          >
            {t('common.password')}
          </label>
          <input
            id="password"
            type="password"
            placeholder={t('auth.passwordPlaceholder')}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              fontSize: '0.9375rem',
              marginBottom: '1.5rem',
              outline: 'none',
            }}
          />

          <button
            id="btn-email-signin"
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--color-accent-primary)',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'var(--transition-fast)',
              border: 'none',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting
              ? (authMode === 'signup' ? t('auth.creatingAccount') : t('auth.signingIn'))
              : (authMode === 'signup' ? t('auth.createAccount') : t('auth.signIn'))}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            clearError();
            setAuthMode((current) => current === 'signin' ? 'signup' : 'signin');
          }}
          style={{
            marginTop: '1rem',
            width: '100%',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
            background: 'transparent',
            border: 'none',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {authMode === 'signin' ? t('auth.needAccount') : t('auth.haveAccount')}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={(
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <div className="surface" style={{ padding: '1.5rem 2rem', fontSize: '0.9375rem' }}>
            {t('auth.loadingSignIn')}
          </div>
        </main>
      )}
    >
      <LoginPageContent />
    </Suspense>
  );
}
