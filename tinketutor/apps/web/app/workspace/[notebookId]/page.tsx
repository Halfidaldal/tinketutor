'use client';

import { useRef, useState } from 'react';

import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useWorkspace } from './layout';

const STATUS_CONFIG: Record<string, { color: string; bg: string; labelKey: string }> = {
  uploaded: { color: 'var(--color-info)', bg: 'var(--color-info-bg)', labelKey: 'workspace.sourceStatus.uploaded' },
  processing: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', labelKey: 'workspace.sourceStatus.processing' },
  ready: { color: 'var(--color-success)', bg: 'var(--color-success-bg)', labelKey: 'workspace.sourceStatus.ready' },
  failed: { color: 'var(--color-error)', bg: 'var(--color-error-bg)', labelKey: 'workspace.sourceStatus.failed' },
};

export default function SourcesPage() {
  const { t } = useI18n();
  const { notebook, sources, focus, setFocus, refreshSources, error } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const citationFocus = focus?.type === 'citation' ? focus : null;

  const handleUpload = async (file: File) => {
    if (!notebook) {
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('notebookId', notebook.id);
      await api.sources.upload(formData);
      await refreshSources();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('sourcesPage.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file).catch(() => undefined);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      handleUpload(file).catch(() => undefined);
    }
  };

  return (
    <div style={{ width: '100%', padding: '1.25rem 1.5rem 2rem', display: 'grid', gap: '1rem' }}>
      {citationFocus && (
        <div className="surface" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                {t('sourcesPage.supportingExcerpt')}
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {citationFocus.resolution.citation.source_title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                {t('sourcesPage.pagesLabel', {
                  values: {
                    start: citationFocus.resolution.citation.page_start,
                    end: citationFocus.resolution.citation.page_end,
                  },
                })}
                {citationFocus.resolution.citation.section_title ? ` · ${citationFocus.resolution.citation.section_title}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFocus(null)}
              style={{
                padding: '0.35rem 0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('common.clear')}
            </button>
          </div>

          {citationFocus.resolution.citation_anchors[0]?.snippet_text && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-glow)',
                color: 'var(--color-text-secondary)',
                fontSize: '0.8125rem',
                lineHeight: 1.6,
              }}
            >
              {citationFocus.resolution.citation_anchors[0].snippet_text}
            </div>
          )}

          <div
            style={{
              padding: '0.875rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-surface)',
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            {citationFocus.resolution.chunk.content}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{t('sourcesPage.title')}</h2>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {t('sourcesPage.libraryBody')}
          </p>
        </div>
        {sources.length > 0 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sources.length >= 5}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              opacity: uploading || sources.length >= 5 ? 0.5 : 1,
            }}
          >
            {uploading ? t('sourcesPage.uploading') : t('sourcesPage.uploadSource')}
          </button>
        )}
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className="surface"
        style={{
          padding: sources.length > 0 ? '1.5rem' : '3rem 2rem',
          textAlign: 'center',
          borderStyle: 'dashed',
          cursor: 'pointer',
          transition: 'border-color var(--transition-fast), background var(--transition-fast)',
          borderColor: dragActive ? 'var(--color-accent-primary)' : undefined,
          background: dragActive ? 'var(--color-accent-glow)' : undefined,
        }}
      >
        <div style={{ fontSize: sources.length > 0 ? '1.5rem' : '2.5rem', marginBottom: '0.5rem' }}>
          {uploading ? '⏳' : '📄'}
        </div>
        <p style={{ fontWeight: 500, marginBottom: '0.25rem', fontSize: '0.9375rem' }}>
          {uploading ? t('sourcesPage.uploadingSource') : t('sourcesPage.addSourceDocument')}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
          {t('sourcesPage.dropzoneMeta', { values: { count: sources.length } })}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.pptx,.docx"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {(uploadError || error) && (
        <div
          className="surface"
          style={{
            padding: '0.875rem 1rem',
            borderColor: 'var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.8125rem',
          }}
        >
          {uploadError || error}
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {sources.map((source) => {
            const statusCfg = STATUS_CONFIG[source.status] || STATUS_CONFIG.failed;
            return (
              <div
                key={source.id}
                className="elevated"
                style={{
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.125rem',
                    flexShrink: 0,
                  }}
                >
                  {source.file_type === 'pdf' ? '📕' : source.file_type === 'pptx' ? '📊' : '📝'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9375rem', marginBottom: '0.125rem' }}>
                    {source.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                    {source.file_name} · {source.file_type.toUpperCase()}
                    {source.status === 'ready' && source.chunk_count > 0 && ` · ${
                      source.chunk_count === 1
                        ? t('workspace.chunksOne')
                        : t('workspace.chunksMany', { values: { count: source.chunk_count } })
                    }`}
                    {source.status === 'processing' && ` · ${source.processing_progress ?? 0}%`}
                  </div>
                  {source.error_message && (
                    <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-error)' }}>
                      {source.error_message}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.25rem 0.625rem',
                    borderRadius: 'var(--radius-full)',
                    background: statusCfg.bg,
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: statusCfg.color,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: statusCfg.color,
                      animation: source.status === 'processing' ? 'pulse-soft 1.5s infinite' : 'none',
                    }}
                  />
                  {t(statusCfg.labelKey)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sources.length === 0 && !uploading && (
        <div
          style={{
            textAlign: 'center',
            padding: '1rem',
            color: 'var(--color-text-tertiary)',
            fontSize: '0.8125rem',
          }}
        >
          {t('sourcesPage.emptyGuidance')}
        </div>
      )}
    </div>
  );
}
