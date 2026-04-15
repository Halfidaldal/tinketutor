'use client';

import '@xyflow/react/dist/style.css';

import { useState } from 'react';

import MindmapView from '../../../../components/canvas/MindmapView';
import { api } from '../../../../lib/api';
import type { MindmapTree } from '../../../../lib/concept-map';
import { useI18n } from '../../../../lib/i18n';
import { useWorkspace } from '../layout';

export default function CanvasPage() {
  const { t } = useI18n();
  const { notebook, sources } = useWorkspace();
  const [mindmapTree, setMindmapTree] = useState<MindmapTree | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readySources = sources.filter((source) => source.status === 'ready');
  const hasReadySources = readySources.length > 0;

  async function handleGenerate() {
    if (!notebook) return;

    setWorking(true);
    setError(null);
    try {
      const tree = await api.mindmap.generate(notebook.id) as MindmapTree;
      setMindmapTree(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledgeMapPage.generateError'));
    } finally {
      setWorking(false);
    }
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

  if (!mindmapTree) {
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
              cursor: working ? 'not-allowed' : 'pointer',
            }}
          >
            {working ? t('knowledgeMapPage.generating') : t('knowledgeMapPage.generateButton')}
          </button>
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
        <MindmapView
          tree={mindmapTree}
          sourceCount={readySources.length}
          onRegenerate={handleGenerate}
          generating={working}
        />
      </div>
    </div>
  );
}
