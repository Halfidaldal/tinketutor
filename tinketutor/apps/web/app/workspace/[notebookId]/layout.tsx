'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import TutorPanel from '../../../components/tutor/TutorPanel';
import { api } from '../../../lib/api';
import type {
  CanvasSelectionContext,
  ConceptEdgeDTO,
  ConceptMapDTO,
  ConceptMapEnvelope,
  ConceptNodeDTO,
} from '../../../lib/concept-map';
import { useAuth, useRequireAuth } from '../../../lib/hooks';
import { useI18n } from '../../../lib/i18n';
import {
  syncWorkspaceFocusWithGraph,
  toCanvasSelection,
  type WorkspaceFocus,
} from '../../../lib/workspace-focus';

interface Source {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  file_type: string;
  status: string;
  processing_progress: number;
  chunk_count: number;
  error_message?: string | null;
  last_job_id?: string | null;
  created_at: string;
}

interface NotebookData {
  id: string;
  title: string;
  description: string;
  source_ids: string[];
  status: string;
}

interface WorkspaceState {
  notebook: NotebookData | null;
  sources: Source[];
  conceptMap: ConceptMapDTO | null;
  nodes: ConceptNodeDTO[];
  edges: ConceptEdgeDTO[];
  focus: WorkspaceFocus;
  selection: CanvasSelectionContext;
  workspacePaneOpen: boolean;
  loading: boolean;
  error: string | null;
  refreshSources: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setFocus: (focus: WorkspaceFocus) => void;
  setSelection: (selection: CanvasSelectionContext) => void;
  setWorkspacePaneOpen: (open: boolean) => void;
  setConceptGraph: (graph: ConceptMapEnvelope | null) => void;
  updateNodeInWorkspace: (node: ConceptNodeDTO) => void;
  updateEdgeInWorkspace: (edge: ConceptEdgeDTO) => void;
}

const WorkspaceContext = createContext<WorkspaceState>({
  notebook: null,
  sources: [],
  conceptMap: null,
  nodes: [],
  edges: [],
  focus: null,
  selection: null,
  workspacePaneOpen: true,
  loading: true,
  error: null,
  refreshSources: async () => {},
  refreshWorkspace: async () => {},
  setFocus: () => {},
  setSelection: () => {},
  setWorkspacePaneOpen: () => {},
  setConceptGraph: () => {},
  updateNodeInWorkspace: () => {},
  updateEdgeInWorkspace: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

const WORKSPACE_TABS = [
  { id: 'sources', labelKey: 'workspace.tabs.sources', icon: '📄', href: '' },
  { id: 'canvas', labelKey: 'workspace.tabs.knowledgeMap', icon: '🧠', href: '/canvas' },
  { id: 'quiz', labelKey: 'workspace.tabs.quiz', icon: '📝', href: '/quiz' },
  { id: 'gaps', labelKey: 'workspace.tabs.gaps', icon: '🔍', href: '/gaps' },
] as const;

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading: authLoading, isAuthenticated } = useRequireAuth('/login');
  const { signOutUser } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const notebookId = params.notebookId as string;
  const basePath = `/workspace/${notebookId}`;

  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [conceptMap, setConceptMap] = useState<ConceptMapDTO | null>(null);
  const [nodes, setNodes] = useState<ConceptNodeDTO[]>([]);
  const [edges, setEdges] = useState<ConceptEdgeDTO[]>([]);
  const [focus, setFocus] = useState<WorkspaceFocus>(null);
  const [workspacePaneOpen, setWorkspacePaneOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selection = useMemo(() => toCanvasSelection(focus), [focus]);
  const hasActiveSourceProcessing = sources.some(
    (source) => source.status === 'uploaded' || source.status === 'processing',
  );

  const applyWorkspaceGraph = useCallback((graph: ConceptMapEnvelope | null) => {
    const nextConceptMap = graph?.concept_map || null;
    const nextNodes = graph?.nodes || [];
    const nextEdges = graph?.edges || [];
    setConceptMap(nextConceptMap);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setFocus((current) => syncWorkspaceFocusWithGraph(current, nextConceptMap, nextNodes, nextEdges));
  }, []);

  const updateNodeInWorkspace = useCallback((updatedNode: ConceptNodeDTO) => {
    setNodes((currentNodes) => {
      const nextNodes = currentNodes.map((node) => node.id === updatedNode.id ? updatedNode : node);
      setFocus((currentFocus) => syncWorkspaceFocusWithGraph(currentFocus, conceptMap, nextNodes, edges));
      return nextNodes;
    });
  }, [conceptMap, edges]);

  const updateEdgeInWorkspace = useCallback((updatedEdge: ConceptEdgeDTO) => {
    setEdges((currentEdges) => {
      const nextEdges = currentEdges.map((edge) => edge.id === updatedEdge.id ? updatedEdge : edge);
      setFocus((currentFocus) => syncWorkspaceFocusWithGraph(currentFocus, conceptMap, nodes, nextEdges));
      return nextEdges;
    });
  }, [conceptMap, nodes]);

  const fetchNotebook = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const data = await api.notebooks.get(notebookId) as {
        notebook: NotebookData;
        sources: Source[];
        concept_map: ConceptMapDTO | null;
        nodes: ConceptNodeDTO[];
        edges: ConceptEdgeDTO[];
      };
      setNotebook(data.notebook);
      setSources(data.sources);
      applyWorkspaceGraph(
        data.concept_map
          ? { concept_map: data.concept_map, nodes: data.nodes, edges: data.edges }
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.loadError'));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [applyWorkspaceGraph, notebookId, t]);

  const refreshWorkspace = useCallback(async () => {
    await fetchNotebook(false);
  }, [fetchNotebook]);

  const refreshSources = useCallback(async () => {
    await refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchNotebook().catch(() => undefined);
    }
  }, [authLoading, fetchNotebook, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !hasActiveSourceProcessing) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshWorkspace().catch(() => undefined);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [hasActiveSourceProcessing, isAuthenticated, refreshWorkspace]);

  const activeTab = useMemo(() => {
    if (pathname === basePath || pathname === `${basePath}/sources`) {
      return 'sources';
    }

    return WORKSPACE_TABS.find((tab) => pathname === `${basePath}${tab.href}`)?.id || 'sources';
  }, [basePath, pathname]);

  if (authLoading || !user || loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="skeleton-loading" style={{ width: 200, height: 24, margin: '0 auto 0.75rem' }} />
          <div className="skeleton-loading" style={{ width: 140, height: 16, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (error && !notebook) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div className="surface" style={{ padding: '2rem', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
          <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
          <Link
            href="/dashboard"
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider
      value={{
        notebook,
        sources,
        conceptMap,
        nodes,
        edges,
        focus,
        selection,
        workspacePaneOpen,
        loading,
        error,
        refreshSources,
        refreshWorkspace,
        setFocus,
        setSelection: (nextSelection) => setFocus(nextSelection),
        setWorkspacePaneOpen,
        setConceptGraph: applyWorkspaceGraph,
        updateNodeInWorkspace,
        updateEdgeInWorkspace,
      }}
    >
      <div
        className={`workspace-shell ${workspacePaneOpen ? 'workspace-open' : 'workspace-closed'}`}
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-primary)',
          overflow: 'hidden',
        }}
      >
        <header
          className="glass"
          style={{
            height: 'var(--header-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 1rem',
            borderBottom: '1px solid var(--color-border-primary)',
            flexShrink: 0,
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <Link
              href="/dashboard"
              style={{
                color: 'var(--color-text-tertiary)',
                fontSize: '0.8125rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                whiteSpace: 'nowrap',
              }}
            >
              ← {t('workspace.back')}
            </Link>
            <span style={{ color: 'var(--color-border-secondary)', fontSize: '0.875rem' }}>|</span>
            <div style={{ minWidth: 0, display: 'grid', gap: '0.1rem' }}>
              <h1
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {notebook?.title || t('dashboard.notebookFallback')}
              </h1>
              {notebook?.description && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {notebook.description}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setWorkspacePaneOpen((current) => !current)}
              style={{
                padding: '0.4rem 0.7rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.75rem',
              }}
            >
              {workspacePaneOpen ? t('workspace.hideWorkspacePane') : t('workspace.showWorkspacePane')}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
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

        <div className="workspace-body">
          <aside className="tutor-pane">
            <TutorPanel
              notebookId={notebookId}
              sources={sources.map((source) => ({
                id: source.id,
                title: source.title,
                status: source.status,
              }))}
              focus={focus}
              onFocusChange={setFocus}
              onWorkspacePaneOpenChange={setWorkspacePaneOpen}
            />
          </aside>

          <section className="workspace-pane">
            <div
              className="workspace-pane-header glass"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--color-border-primary)',
                flexShrink: 0,
              }}
            >
              <nav style={{ display: 'flex', gap: '0.125rem', flexWrap: 'wrap' }}>
                {WORKSPACE_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      href={`${basePath}${tab.href}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                        background: isActive ? 'var(--color-accent-glow)' : 'transparent',
                        textDecoration: 'none',
                        transition: 'var(--transition-fast)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <span style={{ fontSize: '0.8125rem' }}>{tab.icon}</span>
                      {t(tab.labelKey)}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="workspace-pane-body">
              {children}
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .workspace-body {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }

        .tutor-pane {
          flex: 0 0 45%;
          min-width: 340px;
          max-width: 42rem;
          min-height: 0;
          background: var(--color-bg-secondary);
          border-right: 1px solid var(--color-border-primary);
          transition:
            flex-basis var(--transition-slow),
            max-width var(--transition-slow),
            border-color var(--transition-fast);
        }

        .workspace-pane {
          flex: 1 1 0%;
          min-width: 0;
          min-height: 0;
          max-width: 100%;
          display: flex;
          flex-direction: column;
          background: var(--color-bg-primary);
          opacity: 1;
          transform: translateX(0);
          overflow: hidden;
          transition:
            max-width var(--transition-slow),
            opacity var(--transition-slow),
            transform var(--transition-slow),
            border-color var(--transition-fast);
        }

        .workspace-pane-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }

        .workspace-shell.workspace-closed .tutor-pane {
          flex: 1 1 auto;
          max-width: none;
        }

        .workspace-shell.workspace-closed .workspace-pane {
          flex: 0 0 0%;
          max-width: 0;
          opacity: 0;
          transform: translateX(18px);
          pointer-events: none;
        }

        @media (max-width: 1100px) {
          .workspace-body {
            flex-direction: column;
          }

          .tutor-pane {
            flex: 0 0 auto;
            min-width: 0;
            max-width: none;
            border-right: none;
            border-bottom: 1px solid var(--color-border-primary);
          }

          .workspace-pane {
            border-left: none;
            max-height: 100%;
          }

          .workspace-shell.workspace-closed .workspace-pane {
            max-height: 0;
            transform: translateY(12px);
          }
        }
      `}</style>
    </WorkspaceContext.Provider>
  );
}
