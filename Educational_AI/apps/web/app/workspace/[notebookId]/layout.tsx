'use client';

/**
 * Workspace Layout — Three-Panel Design
 *
 * per product contract: 
 * - Left sidebar: source list + upload
 * - Center: active tab content (Canvas, Tutor, Quiz, Gaps)
 * - Right: reserved panel (evidence/tutor context)
 *
 * Fetches notebook detail on mount, provides data to child pages via context.
 */

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../../lib/api';
import { useAuth, useRequireAuth } from '../../../lib/hooks';
import type {
  CanvasSelectionContext,
  ConceptEdgeDTO,
  ConceptMapDTO,
  ConceptMapEnvelope,
  ConceptNodeDTO,
} from '../../../lib/concept-map';
import StudySupportPanel from '../../../components/workspace/StudySupportPanel';

// ---- Shared Types ----

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
  selection: CanvasSelectionContext;
  loading: boolean;
  error: string | null;
  refreshSources: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setSelection: (selection: CanvasSelectionContext) => void;
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
  selection: null,
  loading: true,
  error: null,
  refreshSources: async () => {},
  refreshWorkspace: async () => {},
  setSelection: () => {},
  setConceptGraph: () => {},
  updateNodeInWorkspace: () => {},
  updateEdgeInWorkspace: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

function syncSelectionWithGraph(
  selection: CanvasSelectionContext,
  conceptMap: ConceptMapDTO | null,
  nodes: ConceptNodeDTO[],
  edges: ConceptEdgeDTO[],
): CanvasSelectionContext {
  if (!selection || !conceptMap || selection.conceptMapId !== conceptMap.id) {
    return null;
  }

  if (selection.type === 'node') {
    const node = nodes.find((candidate) => candidate.id === selection.node.id);
    return node ? { type: 'node', conceptMapId: conceptMap.id, node } : null;
  }

  const edge = edges.find((candidate) => candidate.id === selection.edge.id);
  if (!edge) {
    return null;
  }
  const sourceLabel = nodes.find((candidate) => candidate.id === edge.source_node_id)?.label || selection.sourceLabel;
  const targetLabel = nodes.find((candidate) => candidate.id === edge.target_node_id)?.label || selection.targetLabel;
  return {
    type: 'edge',
    conceptMapId: conceptMap.id,
    edge,
    sourceLabel,
    targetLabel,
  };
}

// ---- Tabs Config ----

const WORKSPACE_TABS = [
  { id: 'sources', label: 'Sources', icon: '📄', href: '' },
  { id: 'canvas', label: 'Canvas', icon: '🧠', href: '/canvas' },
  { id: 'tutor', label: 'Tutor', icon: '🎓', href: '/tutor' },
  { id: 'quiz', label: 'Quiz', icon: '📝', href: '/quiz' },
  { id: 'gaps', label: 'Gaps', icon: '🔍', href: '/gaps' },
] as const;

// ---- Status Badge ----

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  uploaded: { color: 'var(--color-info)', label: 'Uploaded' },
  processing: { color: 'var(--color-warning)', label: 'Processing' },
  ready: { color: 'var(--color-success)', label: 'Ready' },
  failed: { color: 'var(--color-error)', label: 'Failed' },
};

function SourceStatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.failed;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      fontSize: '0.6875rem', fontWeight: 500, color: cfg.color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.color,
        animation: status === 'processing' ? 'pulse-soft 1.5s infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

// ---- Layout ----

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
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
  const [selection, setSelection] = useState<CanvasSelectionContext>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasActiveSourceProcessing = sources.some(
    (source) => source.status === 'uploaded' || source.status === 'processing'
  );

  const applyWorkspaceGraph = useCallback(
    (graph: ConceptMapEnvelope | null) => {
      const nextConceptMap = graph?.concept_map || null;
      const nextNodes = graph?.nodes || [];
      const nextEdges = graph?.edges || [];
      setConceptMap(nextConceptMap);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelection((current) => syncSelectionWithGraph(current, nextConceptMap, nextNodes, nextEdges));
    },
    [],
  );

  const updateNodeInWorkspace = useCallback((updatedNode: ConceptNodeDTO) => {
    setNodes((current) => {
      const nextNodes = current.map((node) => node.id === updatedNode.id ? updatedNode : node);
      setSelection((currentSelection) => syncSelectionWithGraph(currentSelection, conceptMap, nextNodes, edges));
      return nextNodes;
    });
  }, [conceptMap, edges]);

  const updateEdgeInWorkspace = useCallback((updatedEdge: ConceptEdgeDTO) => {
    setEdges((current) => {
      const nextEdges = current.map((edge) => edge.id === updatedEdge.id ? updatedEdge : edge);
      setSelection((currentSelection) => syncSelectionWithGraph(currentSelection, conceptMap, nodes, nextEdges));
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
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notebook');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [applyWorkspaceGraph, notebookId]);

  const refreshWorkspace = useCallback(async () => {
    await fetchNotebook(false);
  }, [fetchNotebook]);

  const refreshSources = useCallback(async () => {
    await refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchNotebook();
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('notebookId', notebookId);
      await api.sources.upload(formData);
      await refreshSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const activeTab = WORKSPACE_TABS.find(
    (tab) => pathname === `${basePath}${tab.href}`
  )?.id || 'sources';

  // Loading state
  if (authLoading || !user || loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-primary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="skeleton-loading" style={{ width: 200, height: 24, margin: '0 auto 0.75rem' }} />
          <div className="skeleton-loading" style={{ width: 140, height: 16, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !notebook) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-primary)',
      }}>
        <div className="surface" style={{ padding: '2rem', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
          <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>
          <Link href="/dashboard" style={{
            padding: '0.5rem 1rem', background: 'var(--color-accent-primary)',
            color: '#fff', borderRadius: 'var(--radius-md)', fontSize: '0.875rem',
            textDecoration: 'none',
          }}>Back to Dashboard</Link>
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
        selection,
        loading,
        error,
        refreshSources,
        refreshWorkspace,
        setSelection,
        setConceptGraph: applyWorkspaceGraph,
        updateNodeInWorkspace,
        updateEdgeInWorkspace,
      }}
    >
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-primary)', overflow: 'hidden',
      }}>
        {/* Top Bar */}
        <header className="glass" style={{
          height: 'var(--header-height)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1rem', borderBottom: '1px solid var(--color-border-primary)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/dashboard" style={{
              color: 'var(--color-text-tertiary)', fontSize: '0.8125rem',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}>
              ← Back
            </Link>
            <span style={{ color: 'var(--color-border-secondary)', fontSize: '0.875rem' }}>|</span>
            <h1 style={{
              fontSize: '0.9375rem', fontWeight: 600,
              color: 'var(--color-text-primary)', margin: 0,
            }}>
              {notebook?.title || 'Notebook'}
            </h1>
            {notebook?.description && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                — {notebook.description}
              </span>
            )}
          </div>

          {/* Tab Navigation */}
          <nav style={{ display: 'flex', gap: '0.125rem' }}>
            {WORKSPACE_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  href={`${basePath}${tab.href}`}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                    background: isActive ? 'var(--color-accent-glow)' : 'transparent',
                    textDecoration: 'none', transition: 'var(--transition-fast)',
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                  }}
                >
                  <span style={{ fontSize: '0.8125rem' }}>{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              Sign out
            </button>
          </div>
        </header>

        {/* Three-Panel Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Sidebar — Sources */}
          <aside style={{
            width: 'var(--sidebar-width)', flexShrink: 0,
            borderRight: '1px solid var(--color-border-primary)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
          }}>
            <div style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--color-border-primary)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Sources ({sources.length}/5)
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sources.length >= 5}
                style={{
                  padding: '0.25rem 0.625rem',
                  background: 'var(--color-accent-primary)',
                  color: '#fff', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem', fontWeight: 500,
                  opacity: uploading || sources.length >= 5 ? 0.5 : 1,
                }}
              >
                {uploading ? '...' : '+ Add'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx,.docx"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
              {sources.length === 0 ? (
                <div style={{
                  padding: '1.5rem 1rem', textAlign: 'center',
                  color: 'var(--color-text-tertiary)', fontSize: '0.8125rem',
                }}>
                  Upload a PDF, PPTX, or DOCX source to begin processing.
                </div>
              ) : (
                sources.map((src) => (
                  <div
                    key={src.id}
                    style={{
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '0.25rem',
                      background: 'transparent',
                      transition: 'background var(--transition-fast)',
                      cursor: 'default',
                    }}
                  >
                    <div style={{
                      fontSize: '0.8125rem', fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      marginBottom: '0.25rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {src.title}
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                        {src.file_type.toUpperCase()}
                        {src.status === 'ready' && src.chunk_count > 0 && ` · ${src.chunk_count} chunks`}
                        {src.status === 'processing' && ` · ${src.processing_progress}%`}
                      </span>
                      <SourceStatusDot status={src.status} />
                    </div>
                    {src.error_message && (
                      <div style={{
                        marginTop: '0.375rem',
                        fontSize: '0.6875rem',
                        color: 'var(--color-error)',
                        lineHeight: 1.4,
                      }}>
                        {src.error_message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Center — Active Tab Content */}
          <main style={{ flex: 1, overflow: 'auto' }}>
            {children}
          </main>

          {/* Right Panel — Evidence / Tutor Study Support */}
          <aside style={{
            width: 'var(--panel-width)', flexShrink: 0,
            borderLeft: '1px solid var(--color-border-primary)',
            background: 'var(--color-bg-secondary)',
            display: 'flex', flexDirection: 'column',
          }}>
            <StudySupportPanel
              notebookId={notebookId}
              sources={sources}
              selection={selection}
              onClearSelection={() => setSelection(null)}
              defaultMode={activeTab === 'tutor' ? 'tutor' : 'evidence'}
            />
          </aside>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
