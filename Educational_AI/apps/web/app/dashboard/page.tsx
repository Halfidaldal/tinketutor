'use client';

/**
 * Dashboard — Notebook List with Create Flow
 *
 * Real implementation:
 * - Fetches notebooks from backend on mount
 * - Create notebook via modal-like inline form
 * - Loading, empty, and error states
 */

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuth, useRequireAuth } from '../../lib/hooks';

interface Notebook {
  id: string;
  title: string;
  description: string;
  source_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

type ViewState = 'loading' | 'ready' | 'error';

export default function DashboardPage() {
  const { user, loading: authLoading, isAuthenticated } = useRequireAuth('/login');
  const { signOutUser } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState('');

  // Create notebook form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchNotebooks = useCallback(async () => {
    try {
      setViewState('loading');
      const data = await api.notebooks.list() as { notebooks: Notebook[] };
      setNotebooks(data.notebooks);
      setViewState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notebooks');
      setViewState('error');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchNotebooks();
    }
  }, [authLoading, fetchNotebooks, isAuthenticated]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.notebooks.create(newTitle, newDescription);
      setNewTitle('');
      setNewDescription('');
      setShowCreate(false);
      await fetchNotebooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notebook');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch { return iso; }
  };

  if (authLoading || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-bg-primary)',
      }}>
        <div className="surface" style={{ padding: '1.25rem 1.5rem', fontSize: '0.9375rem' }}>
          Loading your workspace…
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <header
        className="glass"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          height: 'var(--header-height)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--color-border-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 700, color: '#fff',
          }}>S</div>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>Synthesis Studio</span>
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
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: '940px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.5rem',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>My Notebooks</h1>
          <button
            id="btn-create-notebook"
            onClick={() => setShowCreate(true)}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'var(--color-accent-primary)', color: '#fff',
              borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <span aria-hidden="true">+</span> New Notebook
          </button>
        </div>

        {/* Create Notebook Form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="elevated animate-slide-up"
            style={{ padding: '1.25rem', marginBottom: '1.5rem' }}
          >
            <div style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="nb-title" style={{
                display: 'block', fontSize: '0.8125rem', fontWeight: 500,
                color: 'var(--color-text-secondary)', marginBottom: '0.375rem',
              }}>Notebook title</label>
              <input
                id="nb-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Danish Contract Law — Exam Prep"
                autoFocus
                required
                style={{
                  width: '100%', padding: '0.625rem 0.875rem',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-secondary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)', fontSize: '0.9375rem',
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="nb-desc" style={{
                display: 'block', fontSize: '0.8125rem', fontWeight: 500,
                color: 'var(--color-text-secondary)', marginBottom: '0.375rem',
              }}>Description (optional)</label>
              <input
                id="nb-desc"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What are you studying?"
                style={{
                  width: '100%', padding: '0.625rem 0.875rem',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-secondary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)', fontSize: '0.9375rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewTitle(''); setNewDescription(''); }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  border: '1px solid var(--color-border-secondary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)', fontSize: '0.8125rem',
                }}
              >Cancel</button>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: creating ? 'var(--color-bg-hover)' : 'var(--color-accent-primary)',
                  color: '#fff', borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem', fontWeight: 500,
                  opacity: creating || !newTitle.trim() ? 0.6 : 1,
                }}
              >{creating ? 'Creating...' : 'Create Notebook'}</button>
            </div>
          </form>
        )}

        {/* Error state */}
        {viewState === 'error' && (
          <div style={{
            padding: '1rem', marginBottom: '1rem',
            background: 'var(--color-error-bg)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            color: 'var(--color-error)', fontSize: '0.875rem',
          }}>
            {error}
            <button onClick={fetchNotebooks} style={{
              marginLeft: '0.75rem', textDecoration: 'underline', color: 'inherit',
            }}>Retry</button>
          </div>
        )}

        {/* Loading state */}
        {viewState === 'loading' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="surface" style={{ padding: '1.25rem' }}>
                <div className="skeleton-loading" style={{ height: '1.125rem', width: '70%', marginBottom: '0.75rem' }} />
                <div className="skeleton-loading" style={{ height: '0.875rem', width: '50%' }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {viewState === 'ready' && notebooks.length === 0 && !showCreate && (
          <div className="surface" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📓</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Create your first notebook
            </h2>
            <p style={{
              color: 'var(--color-text-secondary)', maxWidth: '420px',
              margin: '0 auto 1.5rem', fontSize: '0.9375rem', lineHeight: 1.6,
            }}>
              Upload your study materials and transform them into an interactive 
              learning workspace with concept maps, quizzes, and Socratic tutoring.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--color-accent-primary)', color: '#fff',
                borderRadius: 'var(--radius-md)', fontSize: '0.9375rem', fontWeight: 500,
              }}
            >Create Notebook</button>
          </div>
        )}

        {/* Notebook Grid */}
        {viewState === 'ready' && notebooks.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {notebooks.map((nb) => (
              <Link
                key={nb.id}
                href={`/workspace/${nb.id}`}
                className="surface"
                style={{
                  padding: '1.25rem', textDecoration: 'none', color: 'inherit',
                  transition: 'border-color var(--transition-fast)',
                  display: 'block',
                }}
              >
                <h3 style={{ fontWeight: 500, marginBottom: '0.375rem', fontSize: '1rem' }}>
                  {nb.title}
                </h3>
                {nb.description && (
                  <p style={{
                    fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                    marginBottom: '0.75rem', lineHeight: 1.5,
                  }}>{nb.description}</p>
                )}
                <div style={{
                  display: 'flex', gap: '0.75rem',
                  fontSize: '0.75rem', color: 'var(--color-text-tertiary)',
                }}>
                  <span>📄 {nb.source_ids.length} source{nb.source_ids.length !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{formatDate(nb.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
