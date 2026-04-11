'use client';

import '@xyflow/react/dist/style.css';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import CanvasView from '../../../../components/canvas/CanvasView';
import { api } from '../../../../lib/api';
import type { ConceptMapEnvelope } from '../../../../lib/concept-map';
import { useI18n } from '../../../../lib/i18n';
import { useWorkspace } from '../layout';

export default function CanvasPage() {
  const { t } = useI18n();
  const {
    notebook,
    sources,
    conceptMap,
    nodes,
    edges,
    selection,
    setSelection,
    setConceptGraph,
    updateNodeInWorkspace,
    updateEdgeInWorkspace,
    refreshWorkspace,
  } = useWorkspace();
  const searchParams = useSearchParams();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedFocusKeyRef = useRef<string | null>(null);

  const readySources = sources.filter((source) => source.status === 'ready');
  const hasReadySources = readySources.length > 0;
  const focusId = searchParams.get('focusId');

  useEffect(() => {
    if (!focusId) {
      appliedFocusKeyRef.current = null;
      return;
    }

    if (!conceptMap) {
      return;
    }

    const focusKey = `${conceptMap.id}:${focusId}`;
    if (appliedFocusKeyRef.current === focusKey) {
      return;
    }

    const matchingNode = nodes.find((node) => node.id === focusId);
    if (matchingNode) {
      setSelection({
        type: 'node',
        conceptMapId: conceptMap.id,
        node: matchingNode,
      });
      appliedFocusKeyRef.current = focusKey;
      return;
    }

    const matchingEdge = edges.find((edge) => edge.id === focusId);
    if (matchingEdge) {
      const sourceLabel = nodes.find((node) => node.id === matchingEdge.source_node_id)?.label || 'Source';
      const targetLabel = nodes.find((node) => node.id === matchingEdge.target_node_id)?.label || 'Target';
      setSelection({
        type: 'edge',
        conceptMapId: conceptMap.id,
        edge: matchingEdge,
        sourceLabel,
        targetLabel,
      });
      appliedFocusKeyRef.current = focusKey;
      return;
    }

    appliedFocusKeyRef.current = focusKey;
  }, [conceptMap, edges, focusId, nodes, setSelection]);

  async function handleGenerate() {
    if (!notebook || !hasReadySources) {
      return;
    }

    setWorking(true);
    setError(null);
    try {
      const response = await api.conceptMaps.generate(
        notebook.id,
        readySources.map((source) => source.id),
      ) as ConceptMapEnvelope;
      setConceptGraph(response);
      setSelection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledgeMapPage.generateError'));
    } finally {
      setWorking(false);
    }
  }

  async function handleSaveNode(
    nodeId: string,
    updates: {
      label?: string;
      summary?: string;
      note?: string;
      positionX?: number;
      positionY?: number;
    },
  ) {
    if (!notebook || !conceptMap) {
      return;
    }
    const response = await api.conceptMaps.updateNode(
      notebook.id,
      conceptMap.id,
      nodeId,
      updates,
    ) as { node: typeof nodes[number] };
    updateNodeInWorkspace(response.node);
  }

  async function handleSaveEdge(
    edgeId: string,
    updates: {
      label?: string;
      summary?: string;
    },
  ) {
    if (!notebook || !conceptMap) {
      return;
    }
    const response = await api.conceptMaps.updateEdge(
      notebook.id,
      conceptMap.id,
      edgeId,
      updates,
    ) as { edge: typeof edges[number] };
    updateEdgeInWorkspace(response.edge);
  }

  if (!hasReadySources) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <div className="surface" style={{ maxWidth: 520, padding: '2rem 2.1rem', display: 'grid', gap: '0.75rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('knowledgeMapPage.needsSourcesTitle')}
          </div>
          <div style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
            {t('knowledgeMapPage.needsSourcesBody')}
          </div>
        </div>
      </div>
    );
  }

  if (!conceptMap) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <div className="surface" style={{ maxWidth: 560, padding: '2rem 2.1rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {t('knowledgeMapPage.generateTitle')}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              {t('knowledgeMapPage.generateBody')}
            </div>
          </div>
          {error && (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
          <button
            id="btn-generate-canvas"
            type="button"
            onClick={() => handleGenerate()}
            disabled={working}
            style={{
              justifySelf: 'start',
              padding: '0.7rem 0.95rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 600,
              opacity: working ? 0.65 : 1,
            }}
          >
            {working ? t('knowledgeMapPage.generating') : t('knowledgeMapPage.generateButton')}
          </button>
        </div>
      </div>
    );
  }

  if (conceptMap.generation_status === 'failed') {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <div className="surface" style={{ maxWidth: 600, padding: '2rem 2.1rem', display: 'grid', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('knowledgeMapPage.failedTitle')}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
            {conceptMap.insufficiency_reason || t('knowledgeMapPage.failedFallback')}
          </div>
          {error && (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={working}
              style={{
                padding: '0.7rem 0.95rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-primary)',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 600,
                opacity: working ? 0.65 : 1,
              }}
            >
              {working ? t('knowledgeMapPage.regenerating') : t('knowledgeMapPage.tryAgain')}
            </button>
            <button
              type="button"
              onClick={() => refreshWorkspace()}
              style={{
                padding: '0.7rem 0.95rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              {t('knowledgeMapPage.refreshNotebook')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {error && (
        <div
          style={{
            margin: '0.9rem 1rem 0',
            padding: '0.75rem 0.95rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <CanvasView
          conceptMap={conceptMap}
          nodes={nodes}
          edges={edges}
          selection={selection}
          onSelect={setSelection}
          onClearSelection={() => setSelection(null)}
          onRegenerate={handleGenerate}
          onSaveNode={handleSaveNode}
          onSaveEdge={handleSaveEdge}
          generating={working}
        />
      </div>
    </div>
  );
}
