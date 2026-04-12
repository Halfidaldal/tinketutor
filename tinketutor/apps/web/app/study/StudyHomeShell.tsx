'use client';

/**
 * StudyHomeShell — Phase 2 tutor-led entry surface (`/study`).
 *
 * Responsibilities:
 *   1. Bootstrap (or re-attach to) the user's default study space via
 *      `api.notebooks.bootstrap()`.
 *   2. Bootstrap (or re-attach to) the active onboarding tutor session
 *      via `api.tutor.bootstrapSession()`.
 *   3. Render `<TutorShellPanel>` full-width with a collapsible side rail
 *      listing other study spaces and a link to the subordinate workspace.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import TutorShellPanel from '../../components/tutor-experience/TutorShellPanel';
import { api } from '../../lib/api';
import { useAuth, useRequireAuth } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import type { TutorSession, TutorTurn } from '../../lib/tutor';

interface NotebookSummary {
  id: string;
  title: string;
  description: string;
  source_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface NotebookBootstrapResponse {
  notebook: NotebookSummary;
  created: boolean;
}

interface TutorBootstrapResponse {
  session: TutorSession;
  turn: TutorTurn;
}

interface NotebookListResponse {
  notebooks: NotebookSummary[];
}

type ViewState = 'loading' | 'ready' | 'error';

export default function StudyHomeShell() {
  const { uiLocale, responseLocale, t } = useI18n();
  const { user, loading: authLoading, isAuthenticated } = useRequireAuth('/login');
  const { signOutUser } = useAuth();

  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<NotebookSummary | null>(null);
  const [initialSession, setInitialSession] = useState<TutorSession | null>(null);
  const [initialTurns, setInitialTurns] = useState<TutorTurn[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState<string | null>(null);

  const bootstrapStudyHome = useCallback(
    async (preferredNotebookId?: string) => {
      setViewState('loading');
      setError(null);
      try {
        const locales = { uiLocale, responseLocale };

        // Resolve which study space to attach to. Prefer explicit selection,
        // otherwise let the backend decide (most-recent or auto-create).
        let notebook: NotebookSummary;
        if (preferredNotebookId) {
          const list = (await api.notebooks.list()) as NotebookListResponse;
          const match = list.notebooks.find((n) => n.id === preferredNotebookId);
          if (!match) {
            throw new Error(t('tutorExperience.studyHome.loadError'));
          }
          notebook = match;
          setNotebooks(list.notebooks);
        } else {
          const bootstrapResponse = (await api.notebooks.bootstrap(
            locales,
          )) as NotebookBootstrapResponse;
          notebook = bootstrapResponse.notebook;
          const list = (await api.notebooks.list()) as NotebookListResponse;
          setNotebooks(list.notebooks);
        }

        setActiveNotebook(notebook);

        const tutorBootstrap = (await api.tutor.bootstrapSession(
          notebook.id,
          locales,
        )) as TutorBootstrapResponse;

        setInitialSession(tutorBootstrap.session);
        setInitialTurns(tutorBootstrap.turn ? [tutorBootstrap.turn] : []);
        setViewState('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('tutorExperience.studyHome.bootstrapError'));
        setViewState('error');
      }
    },
    [responseLocale, t, uiLocale],
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void bootstrapStudyHome();
    }
  }, [authLoading, bootstrapStudyHome, isAuthenticated]);

  if (authLoading || !user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div className="surface" style={{ padding: '1.25rem 1.5rem', fontSize: '0.9375rem' }}>
          {t('dashboard.loadingWorkspace')}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        className="glass"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--color-border-primary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background:
                'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            T
          </div>
          <div style={{ display: 'grid' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{t('common.brand')}</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
              {t('tutorExperience.studyHome.title')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '0.4rem 0.7rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-secondary)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '0.75rem',
              textDecoration: 'none',
            }}
          >
            {t('tutorExperience.studyHome.sideRailSwitcher')}
          </Link>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>
            {user.displayName || user.email}
          </span>
          <button
            type="button"
            onClick={() => signOutUser()}
            style={{
              padding: '0.4rem 0.7rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-secondary)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '0.75rem',
            }}
          >
            {t('common.signOut')}
          </button>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) 1fr',
          gap: 0,
        }}
      >
        {/* Side rail: study-space switcher */}
        <aside
          className="glass"
          style={{
            borderRight: '1px solid var(--color-border-primary)',
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {t('tutorExperience.studyHome.sideRailSwitcher')}
          </div>

          {notebooks.length === 0 && viewState === 'loading' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
              {t('tutorExperience.studyHome.loading')}
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {notebooks.map((notebook) => {
              const isActive = activeNotebook?.id === notebook.id;
              return (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => void bootstrapStudyHome(notebook.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${
                      isActive ? 'var(--color-border-accent)' : 'var(--color-border-secondary)'
                    }`,
                    background: isActive
                      ? 'var(--color-accent-glow)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--color-accent-primary)'
                      : 'var(--color-text-primary)',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                    display: 'grid',
                    gap: '0.2rem',
                  }}
                >
                  <span>{notebook.title || t('tutorExperience.studyHome.defaultStudySpaceName')}</span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 500,
                    }}
                  >
                    {notebook.source_ids.length === 1
                      ? t('dashboard.sourcesCountOne')
                      : t('dashboard.sourcesCountMany', {
                          values: { count: notebook.source_ids.length },
                        })}
                  </span>
                </button>
              );
            })}
          </div>

          {activeNotebook && (
            <Link
              href={`/workspace/${activeNotebook.id}`}
              style={{
                marginTop: 'auto',
                display: 'block',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.75rem',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              {t('tutorExperience.studyHome.openWorkspaceCta')}
            </Link>
          )}
        </aside>

        {/* Tutor shell */}
        <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {viewState === 'error' && (
            <div
              style={{
                margin: '1rem',
                padding: '1rem',
                background: 'var(--color-error-bg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                color: 'var(--color-error)',
                fontSize: '0.875rem',
              }}
            >
              {error}
              <button
                onClick={() => void bootstrapStudyHome()}
                style={{
                  marginLeft: '0.75rem',
                  textDecoration: 'underline',
                  color: 'inherit',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {viewState !== 'error' && activeNotebook && (
            <TutorShellPanel
              notebookId={activeNotebook.id}
              studySpaceTitle={
                activeNotebook.title || t('tutorExperience.studyHome.defaultStudySpaceName')
              }
              initialSession={initialSession}
              initialTurns={initialTurns}
            />
          )}

          {viewState === 'loading' && !activeNotebook && (
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.875rem',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {t('tutorExperience.studyHome.loading')}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
