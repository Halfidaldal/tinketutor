'use client';

/**
 * StudyHomeShell — Phase 3 dashboard-style study home (`/study`).
 *
 * Two-level hierarchy:
 *   1. Subjects (top-level cards) — derived from notebook.description
 *   2. Notebooks (sub-items within a subject) — each is a sub-theme
 *
 * Clicking a subject card expands it to show its notebooks.
 * Each notebook has an "Open Workspace" CTA → full workspace.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { api } from '../../lib/api';
import { useAuth, useRequireAuth } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

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

interface NotebookListResponse {
  notebooks: NotebookSummary[];
}

type ViewState = 'loading' | 'ready' | 'error';

function formatRelativeDate(
  dateString: string,
  t: (key: string, options?: { values?: Record<string, string | number> }) => string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('studyHome.today');
  if (diffDays === 1) return t('studyHome.yesterday');
  if (diffDays < 7) return t('studyHome.daysAgo', { values: { count: diffDays } });
  return date.toLocaleDateString();
}

function groupBySubject(notebooks: NotebookSummary[], fallback: string): Map<string, NotebookSummary[]> {
  const grouped = new Map<string, NotebookSummary[]>();
  for (const nb of notebooks) {
    const subject = nb.description?.trim() || fallback;
    if (!grouped.has(subject)) grouped.set(subject, []);
    grouped.get(subject)!.push(nb);
  }
  return grouped;
}

export default function StudyHomeShell() {
  const { uiLocale, responseLocale, t } = useI18n();
  const { user, loading: authLoading, isAuthenticated } = useRequireAuth('/login');
  const { signOutUser } = useAuth();

  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotebookSummary | null>(null);

  // New subject form state
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newNotebookName, setNewNotebookName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadStudyHome = useCallback(
    async () => {
      setViewState('loading');
      setError(null);
      try {
        const locales = { uiLocale, responseLocale };
        await api.notebooks.bootstrap(locales) as NotebookBootstrapResponse;
        const list = (await api.notebooks.list()) as NotebookListResponse;
        setNotebooks(list.notebooks);
        setViewState('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('studyHome.loadError'));
        setViewState('error');
      }
    },
    [responseLocale, t, uiLocale],
  );

  async function handleDeleteNotebook() {
    if (!deleteTarget) return;
    try {
      await api.notebooks.delete(deleteTarget.id);
      setNotebooks((prev) => prev.filter((n) => n.id !== deleteTarget.id));
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleCreateSubject() {
    const subject = newSubjectName.trim();
    const title = newNotebookName.trim() || t('studyHome.defaultNotebookName');
    if (!subject) return;

    setCreating(true);
    try {
      const result = (await api.notebooks.create(title, subject)) as { notebook: NotebookSummary };
      setNotebooks((prev) => [...prev, result.notebook]);
      setNewSubjectName('');
      setNewNotebookName('');
      setShowNewSubject(false);
      setExpandedSubject(subject);
    } catch {
      // Silently fail — API error handling is elsewhere
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void loadStudyHome();
    }
  }, [authLoading, loadStudyHome, isAuthenticated]);

  const grouped = groupBySubject(notebooks, t('studyHome.otherSubject'));
  const subjectEntries = Array.from(grouped.entries());
  const totalSources = notebooks.reduce((sum, nb) => sum + nb.source_ids.length, 0);

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
      {/* Header */}
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
              background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
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
              {t('studyHome.title')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

      {/* Main */}
      <main
        style={{
          flex: 1,
          padding: '2rem 1.5rem',
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Welcome */}
        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {t('studyHome.welcome')}
          </h1>
          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              gap: '1.5rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>{t('studyHome.subjectCount', { values: { count: subjectEntries.length } })}</span>
            <span>{t('studyHome.notebookCount', { values: { count: notebooks.length } })}</span>
            <span>{t('studyHome.sourceCount', { values: { count: totalSources } })}</span>
          </div>
        </div>

        {/* Error */}
        {viewState === 'error' && (
          <div
            style={{
              marginBottom: '1.5rem',
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
              onClick={() => void loadStudyHome()}
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

        {/* Loading */}
        {viewState === 'loading' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="skeleton-loading"
                style={{ height: 100, borderRadius: 'var(--radius-lg)' }}
              />
            ))}
          </div>
        )}

        {/* Subject cards */}
        {viewState === 'ready' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {subjectEntries.map(([subject, group]) => {
              const isExpanded = expandedSubject === subject;
              const totalSubjectSources = group.reduce((s, nb) => s + nb.source_ids.length, 0);
              const latestUpdate = group.reduce(
                (latest, nb) => (nb.updated_at > latest ? nb.updated_at : latest),
                group[0].updated_at,
              );

              return (
                <div
                  key={subject}
                  className="card-interactive"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    borderColor: isExpanded ? 'var(--color-accent-primary)' : undefined,
                    boxShadow: isExpanded ? 'var(--shadow-lg)' : undefined,
                  }}
                >
                  {/* Subject header (always visible) */}
                  <button
                    type="button"
                    onClick={() => setExpandedSubject(isExpanded ? null : subject)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
                        {subject}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        <span>{t('studyHome.notebooksInSubject', { values: { count: group.length } })}</span>
                        <span>{t('studyHome.sourceCount', { values: { count: totalSubjectSources } })}</span>
                        <span>{formatRelativeDate(latestUpdate, t)}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        background: isExpanded ? 'var(--color-accent-glow)' : 'var(--color-bg-surface)',
                        color: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-text-tertiary)',
                        fontSize: '0.875rem',
                        transition: 'transform 150ms ease, background 150ms ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                      }}
                    >
                      ▾
                    </div>
                  </button>

                  {/* Expanded: notebook list */}
                  {isExpanded && (
                    <div
                      className="animate-slide-up"
                      style={{
                        borderTop: '1px solid var(--color-border-primary)',
                        padding: '0.75rem 1.25rem 1.25rem',
                        display: 'grid',
                        gap: '0.625rem',
                      }}
                    >
                      {group.map((notebook) => (
                        <div
                          key={notebook.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            padding: '0.75rem 0.875rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border-primary)',
                            background: 'var(--color-bg-elevated)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {notebook.title || t('studyHome.untitledNotebook')}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', marginTop: '0.15rem' }}>
                              {notebook.source_ids.length === 1
                                ? t('dashboard.sourcesCountOne')
                                : t('dashboard.sourcesCountMany', { values: { count: notebook.source_ids.length } })}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                            <Link
                              href={`/workspace/${notebook.id}`}
                              className="btn-cta"
                              style={{
                                padding: '0.4rem 0.75rem',
                                fontSize: '0.75rem',
                                textDecoration: 'none',
                              }}
                            >
                              {t('studyHome.openWorkspace')}
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(notebook);
                              }}
                              title={t('common.delete')}
                              style={{
                                width: 26,
                                height: 26,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.6875rem',
                                color: 'var(--color-text-tertiary)',
                                opacity: 0.5,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Create new subject */}
            {!showNewSubject ? (
              <button
                type="button"
                onClick={() => setShowNewSubject(true)}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '2px dashed var(--color-border-secondary)',
                  background: 'transparent',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'border-color var(--transition-fast), color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                  e.currentTarget.style.color = 'var(--color-accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }}
              >
                + {t('studyHome.newSubject')}
              </button>
            ) : (
              <div
                className="surface"
                style={{
                  padding: '1.25rem',
                  display: 'grid',
                  gap: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {t('studyHome.newSubject')}
                </div>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder={t('studyHome.subjectNamePlaceholder')}
                  autoFocus
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-secondary)',
                    background: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.875rem',
                    width: '100%',
                  }}
                />
                <input
                  type="text"
                  value={newNotebookName}
                  onChange={(e) => setNewNotebookName(e.target.value)}
                  placeholder={t('studyHome.firstNotebookPlaceholder')}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-secondary)',
                    background: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.875rem',
                    width: '100%',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-cta"
                    disabled={creating || !newSubjectName.trim()}
                    onClick={() => void handleCreateSubject()}
                    style={{ opacity: creating || !newSubjectName.trim() ? 0.6 : 1 }}
                  >
                    {creating ? t('common.working') : t('studyHome.createSubject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewSubject(false);
                      setNewSubjectName('');
                      setNewNotebookName('');
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-secondary)',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={deleteTarget ? t('dashboard.deleteConfirm', { values: { title: deleteTarget.title } }) : ''}
        onConfirm={() => void handleDeleteNotebook()}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}
