'use client';

import { useRef, useState } from 'react';

import { useI18n } from '../../lib/i18n';
import type { WorkspaceFocus } from '../../lib/workspace-focus';

const STATUS_DOT: Record<string, string> = {
  uploaded: 'var(--color-info)',
  processing: 'var(--color-warning)',
  ready: 'var(--color-success)',
  failed: 'var(--color-error)',
};

const FILE_ICON: Record<string, string> = {
  pdf: '\uD83D\uDCD5',
  pptx: '\uD83D\uDCCA',
  docx: '\uD83D\uDCDD',
};

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

export default function SourceSidebar({
  sources,
  selectedSourceIds,
  onToggleSource,
  onSelectAll,
  onDeselectAll,
  focus,
  onFocusChange,
  onUpload,
  onDeleteSource,
}: {
  sources: Source[];
  selectedSourceIds: string[];
  onToggleSource: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  focus: WorkspaceFocus;
  onFocusChange: (focus: WorkspaceFocus) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const citationFocus = focus?.type === 'citation' ? focus : null;
  const readySources = sources.filter((s) => s.status === 'ready');
  const allSelected = readySources.length > 0 && readySources.every((s) => selectedSourceIds.includes(s.id));

  async function handleFile(file: File) {
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function handleDelete(sourceId: string) {
    setDeletingId(sourceId);
    try {
      await onDeleteSource(sourceId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '0.75rem 0.875rem',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
          {t('sourcesPage.title')}
        </span>
        {readySources.length > 0 && (
          <button
            type="button"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            style={{
              fontSize: '0.6875rem',
              color: 'var(--color-accent-primary)',
              padding: '0.2rem 0.4rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {allSelected ? t('workspace.sourceSidebar.deselectAll') : t('workspace.sourceSidebar.selectAll')}
          </button>
        )}
      </div>

      {/* Citation Focus */}
      {citationFocus && (
        <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-accent-glow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent-primary)' }}>
              {t('sourcesPage.supportingExcerpt')}
            </span>
            <button
              type="button"
              onClick={() => onFocusChange(null)}
              style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)', padding: '0.15rem 0.35rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-secondary)' }}
            >
              {t('common.clear')}
            </button>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>
            {citationFocus.resolution.citation.source_title}
          </div>
          {citationFocus.resolution.citation_anchors[0]?.snippet_text && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, maxHeight: 100, overflow: 'auto' }}>
              {citationFocus.resolution.citation_anchors[0].snippet_text}
            </div>
          )}
        </div>
      )}

      {/* Source List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0.625rem' }}>
        {sources.length === 0 && !uploading && (
          <div style={{ padding: '1rem 0.5rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.75rem' }}>
            {t('sourcesPage.emptyGuidance')}
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.25rem' }}>
          {sources.map((source) => {
            const isReady = source.status === 'ready';
            const isSelected = selectedSourceIds.includes(source.id);
            const isDeleting = deletingId === source.id;
            const dotColor = STATUS_DOT[source.status] || STATUS_DOT.failed;

            return (
              <div
                key={source.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid transparent',
                  background: isSelected ? 'var(--color-accent-glow)' : 'transparent',
                  transition: 'background var(--transition-fast)',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isReady}
                  onChange={() => onToggleSource(source.id)}
                  style={{
                    width: 15,
                    height: 15,
                    accentColor: 'var(--color-accent-primary)',
                    flexShrink: 0,
                    cursor: isReady ? 'pointer' : 'default',
                    opacity: isReady ? 1 : 0.3,
                  }}
                />

                {/* Icon + Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {FILE_ICON[source.file_type] || '\uD83D\uDCC4'} {source.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.125rem' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, animation: source.status === 'processing' ? 'pulse-soft 1.5s infinite' : 'none' }} />
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                      {t(`workspace.sourceStatus.${source.status}`)}
                      {source.status === 'processing' ? ` ${source.processing_progress ?? 0}%` : ''}
                    </span>
                  </div>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(source.id);
                  }}
                  disabled={isDeleting}
                  title={t('common.delete')}
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-tertiary)',
                    opacity: 0.6,
                    transition: 'opacity var(--transition-fast), color var(--transition-fast)',
                  }}
                >
                  \u2715
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload zone */}
      <div
        style={{
          padding: '0.625rem',
          borderTop: '1px solid var(--color-border-primary)',
          flexShrink: 0,
        }}
      >
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          style={{
            padding: '0.75rem',
            textAlign: 'center',
            borderRadius: 'var(--radius-md)',
            border: `1px dashed ${dragActive ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
            background: dragActive ? 'var(--color-accent-glow)' : 'transparent',
            cursor: sources.length >= 5 ? 'not-allowed' : 'pointer',
            transition: 'border-color var(--transition-fast), background var(--transition-fast)',
            opacity: uploading || sources.length >= 5 ? 0.5 : 1,
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {uploading ? t('sourcesPage.uploadingSource') : t('workspace.sourceSidebar.uploadHint')}
          </div>
          <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)', marginTop: '0.125rem' }}>
            {t('sourcesPage.dropzoneMeta', { values: { count: sources.length } })}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.docx"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}
