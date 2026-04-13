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

import ConfirmDialog from '../../../components/shared/ConfirmDialog';
import SourceSidebar from '../../../components/workspace/SourceSidebar';
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
  selectedSourceIds: string[];
  conceptMap: ConceptMapDTO | null;
  nodes: ConceptNodeDTO[];
  edges: ConceptEdgeDTO[];
  focus: WorkspaceFocus;
  selection: CanvasSelectionContext;
  studioPaneOpen: boolean;
  loading: boolean;
  error: string | null;
  refreshSources: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setFocus: (focus: WorkspaceFocus) => void;
  setSelection: (selection: CanvasSelectionContext) => void;
  setStudioPaneOpen: (open: boolean) => void;
  setConceptGraph: (graph: ConceptMapEnvelope | null) => void;
  updateNodeInWorkspace: (node: ConceptNodeDTO) => void;
  updateEdgeInWorkspace: (edge: ConceptEdgeDTO) => void;
  toggleSourceSelection: (id: string) => void;
  setSelectedSourceIds: (ids: string[]) => void;
}

const WorkspaceContext = createContext<WorkspaceState>({
  notebook: null,
  sources: [],
  selectedSourceIds: [],
  conceptMap: null,
  nodes: [],
  edges: [],
  focus: null,
  selection: null,
  studioPaneOpen: true,
  loading: true,
  error: null,
  refreshSources: async () => {},
  refreshWorkspace: async () => {},
  setFocus: () => {},
  setSelection: () => {},
  setStudioPaneOpen: () => {},
  setConceptGraph: () => {},
  updateNodeInWorkspace: () => {},
  updateEdgeInWorkspace: () => {},
  toggleSourceSelection: () => {},
  setSelectedSourceIds: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

const STUDIO_TABS = [
  { id: 'canvas', labelKey: 'workspace.tabs.knowledgeMap', icon: '\uD83E\uDDE0', href: '/canvas' },
  { id: 'quiz', labelKey: 'workspace.tabs.quiz', icon: '\uD83D\uDCDD', href: '/quiz' },
  { id: 'gaps', labelKey: 'workspace.tabs.gaps', icon: '\uD83D\uDD0D', href: '/gaps' },
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
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [conceptMap, setConceptMap] = useState<ConceptMapDTO | null>(null);
  const [nodes, setNodes] = useState<ConceptNodeDTO[]>([]);
  const [edges, setEdges] = useState<ConceptEdgeDTO[]>([]);
  const [focus, setFocus] = useState<WorkspaceFocus>(null);
  const [studioPaneOpen, setStudioPaneOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceDeleteTarget, setSourceDeleteTarget] = useState<Source | null>(null);

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

  const toggleSourceSelection = useCallback((id: string) => {
    setSelectedSourceIds((current) =>
      current.includes(id) ? current.filter((sid) => sid !== id) : [...current, id],
    );
  }, []);

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

      // Auto-select newly ready sources
      setSelectedSourceIds((prev) => {
        const readyIds = data.sources.filter((s) => s.status === 'ready').map((s) => s.id);
        if (prev.length === 0) return readyIds;
        const existingValid = prev.filter((id) => readyIds.includes(id));
        const newReady = readyIds.filter((id) => !prev.includes(id));
        return [...existingValid, ...newReady];
      });

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
    return STUDIO_TABS.find((tab) => pathname === `${basePath}${tab.href}`)?.id || 'canvas';
  }, [basePath, pathname]);

  async function handleSourceUpload(file: File) {
    if (!notebook) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
    formData.append('notebookId', notebook.id);
    await api.sources.upload(formData);
    await refreshSources();
  }

  async function handleDeleteSource(sourceId: string) {
    const source = sources.find((s) => s.id === sourceId);
    if (source) setSourceDeleteTarget(source);
  }

  async function confirmDeleteSource() {
    if (!sourceDeleteTarget) return;
    try {
      await api.sources.delete(sourceDeleteTarget.id);
      setSelectedSourceIds((prev) => prev.filter((id) => id !== sourceDeleteTarget.id));
      await refreshSources();
    } finally {
      setSourceDeleteTarget(null);
    }
  }

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
          <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
          <Link href="/study" className="btn-primary" style={{ textDecoration: 'none' }}>
            {t('workspace.back')}
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
        selectedSourceIds,
        conceptMap,
        nodes,
        edges,
        focus,
        selection,
        studioPaneOpen,
        loading,
        error,
        refreshSources,
        refreshWorkspace,
        setFocus,
        setSelection: (nextSelection) => setFocus(nextSelection),
        setStudioPaneOpen,
        setConceptGraph: applyWorkspaceGraph,
        updateNodeInWorkspace,
        updateEdgeInWorkspace,
        toggleSourceSelection,
        setSelectedSourceIds,
      }}
    >
      <div
        className={`workspace-shell ${studioPaneOpen ? 'studio-open' : 'studio-closed'}`}
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-primary)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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
              href="/study"
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
              \u2190 {t('workspace.back')}
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
              className="btn-secondary"
              onClick={() => setStudioPaneOpen((current) => !current)}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
            >
              {studioPaneOpen ? t('workspace.hideStudio') : t('workspace.showStudio')}
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

        {/* 3-column body */}
        <div className="workspace-body">
          {/* Left: Source sidebar */}
          <aside className="source-sidebar">
            <SourceSidebar
              sources={sources}
              selectedSourceIds={selectedSourceIds}
              onToggleSource={toggleSourceSelection}
              onSelectAll={() => setSelectedSourceIds(sources.filter((s) => s.status === 'ready').map((s) => s.id))}
              onDeselectAll={() => setSelectedSourceIds([])}
              focus={focus}
              onFocusChange={setFocus}
              onUpload={handleSourceUpload}
              onDeleteSource={handleDeleteSource}
            />
          </aside>

          {/* Center: Tutor */}
          <main className="tutor-main tutor-conversation-area">
            <TutorPanel
              notebookId={notebookId}
              sources={sources.map((source) => ({
                id: source.id,
                title: source.title,
                status: source.status,
              }))}
              focus={focus}
              onFocusChange={setFocus}
              onWorkspacePaneOpenChange={setStudioPaneOpen}
              selectedSourceIds={selectedSourceIds}
            />
          </main>

          {/* Right: Studio panel */}
          <section className="studio-panel">
            <div
              className="studio-panel-header glass"
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
                {STUDIO_TABS.map((tab) => {
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

            <div className="studio-panel-body">
              {children}
            </div>
          </section>
        </div>
      </div>

      {/* Source delete confirmation */}
      <ConfirmDialog
        open={!!sourceDeleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={sourceDeleteTarget ? t('sourcesPage.deleteConfirm', { values: { title: sourceDeleteTarget.title } }) : ''}
        onConfirm={() => void confirmDeleteSource()}
        onCancel={() => setSourceDeleteTarget(null)}
        variant="danger"
      />

      <style jsx>{`
        .workspace-body {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }

        .source-sidebar {
          flex: 0 0 240px;
          min-height: 0;
          background: var(--color-bg-secondary);
          border-right: 1px solid var(--color-border-primary);
          overflow: hidden;
          transition: flex-basis var(--transition-slow), max-width var(--transition-slow);
        }

        .tutor-main {
          flex: 1 1 auto;
          min-width: 320px;
          min-height: 0;
          overflow: hidden;
        }

        .studio-panel {
          flex: 0 0 45%;
          max-width: 52rem;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: var(--color-bg-secondary);
          border-left: 1px solid var(--color-border-primary);
          opacity: 1;
          transform: translateX(0);
          overflow: hidden;
          transition:
            max-width var(--transition-slow),
            flex-basis var(--transition-slow),
            opacity var(--transition-slow),
            transform var(--transition-slow);
        }

        .studio-panel-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }

        .workspace-shell.studio-closed .tutor-main {
          flex: 1 1 auto;
        }

        .workspace-shell.studio-closed .studio-panel {
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

          .source-sidebar {
            flex: 0 0 auto;
            max-height: 180px;
            border-right: none;
            border-bottom: 1px solid var(--color-border-primary);
          }

          .tutor-main {
            min-width: 0;
            flex: 1 1 auto;
          }

          .studio-panel {
            flex: 0 0 auto;
            max-width: none;
            border-left: none;
            border-top: 1px solid var(--color-border-primary);
            max-height: 50%;
          }

          .workspace-shell.studio-closed .studio-panel {
            max-height: 0;
            transform: translateY(12px);
          }
        }

        @media (max-width: 768px) {
          .source-sidebar {
            max-height: 140px;
          }
        }
      `}</style>
    </WorkspaceContext.Provider>
  );
}
