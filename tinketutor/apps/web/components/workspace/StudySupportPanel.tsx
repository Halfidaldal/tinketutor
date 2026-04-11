'use client';

import { useEffect, useState } from 'react';

import type { CanvasSelectionContext } from '../../lib/concept-map';
import { useI18n } from '../../lib/i18n';
import EvidencePanel from '../retrieval/EvidencePanel';
import TutorPanel from '../tutor/TutorPanel';

interface SourceSummary {
  id: string;
  title: string;
  status: string;
}

type StudyMode = 'evidence' | 'tutor';

export function StudySupportPanel({
  notebookId,
  sources,
  selection,
  onClearSelection,
  defaultMode,
}: {
  notebookId: string;
  sources: SourceSummary[];
  selection: CanvasSelectionContext;
  onClearSelection: () => void;
  defaultMode: StudyMode;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<StudyMode>(defaultMode);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {selection && (
        <div
          style={{
            padding: '0.875rem 0.875rem 0.75rem',
            borderBottom: '1px solid var(--color-border-primary)',
            display: 'grid',
            gap: '0.375rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gap: '0.125rem' }}>
              <span style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                {t('studySupport.selectedElement')}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
                {selection.type === 'node'
                  ? selection.node.label
                  : `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`}
              </span>
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border-secondary)',
                borderRadius: 'var(--radius-full)',
                padding: '0.2rem 0.45rem',
                whiteSpace: 'nowrap',
              }}
            >
              {t('common.clear')}
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {selection.type === 'node'
              ? selection.node.summary || t('studySupport.nodeFallback')
              : selection.edge.summary || t('studySupport.edgeFallback')}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.375rem',
          padding: '0.75rem',
          borderBottom: '1px solid var(--color-border-primary)',
        }}
      >
        {(['evidence', 'tutor'] as const).map((value) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.625rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${active ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
                background: active ? 'var(--color-accent-glow)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {value === 'evidence' ? t('common.evidence') : t('common.tutor')}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'evidence' ? (
          <EvidencePanel notebookId={notebookId} sources={sources} selection={selection} />
        ) : (
          <TutorPanel notebookId={notebookId} sources={sources} selection={selection} />
        )}
      </div>
    </div>
  );
}

export default StudySupportPanel;
