'use client';

/**
 * Sources Tab — Default workspace view
 *
 * Shows source list with processing status and file upload.
 * Uses WorkspaceContext from the layout for shared state.
 */

import { useRef, useState } from 'react';
import { useWorkspace } from './layout';
import { api } from '../../../lib/api';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  uploaded: { color: 'var(--color-info)', bg: 'var(--color-info-bg)', label: 'Uploaded' },
  processing: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'Processing...' },
  ready: { color: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'Ready' },
  failed: { color: 'var(--color-error)', bg: 'var(--color-error-bg)', label: 'Failed' },
};

export default function SourcesPage() {
  const { notebook, sources, refreshSources, error } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!notebook) return;
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
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '760px', margin: '0 auto' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem',
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Sources</h2>
        {sources.length > 0 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sources.length >= 5}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-accent-primary)', color: '#fff',
              borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', fontWeight: 500,
              opacity: uploading || sources.length >= 5 ? 0.5 : 1,
            }}
          >{uploading ? 'Uploading...' : 'Upload Source'}</button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
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
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ fontSize: sources.length > 0 ? '1.5rem' : '2.5rem', marginBottom: '0.5rem' }}>
          {uploading ? '⏳' : '📄'}
        </div>
        <p style={{ fontWeight: 500, marginBottom: '0.25rem', fontSize: '0.9375rem' }}>
          {uploading ? 'Uploading source...' : 'Add a source document'}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
          PDF, PPTX, DOCX · up to 50 MB each · {sources.length}/5 sources
        </p>
      </div>
      <input
        ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx"
        onChange={handleFileInput} style={{ display: 'none' }}
      />

      {(uploadError || error) && (
        <div
          className="surface"
          style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            borderColor: 'var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.8125rem',
          }}
        >
          {uploadError || error}
        </div>
      )}

      {/* Source List */}
      {sources.length > 0 && (
        <div>
          {sources.map((src) => {
            const statusCfg = STATUS_CONFIG[src.status] || STATUS_CONFIG.failed;
            return (
              <div
                key={src.id}
                className="elevated"
                style={{
                  padding: '1rem 1.25rem', marginBottom: '0.5rem',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.125rem', flexShrink: 0,
                }}>
                  {src.file_type === 'pdf' ? '📕' : src.file_type === 'pptx' ? '📊' : '📝'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9375rem', marginBottom: '0.125rem' }}>
                    {src.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                    {src.file_name} · {src.file_type.toUpperCase()}
                    {src.status === 'ready' && src.chunk_count > 0 && ` · ${src.chunk_count} chunks`}
                    {src.status === 'processing' && ` · ${src.processing_progress ?? 0}%`}
                  </div>
                  {src.error_message && (
                    <div style={{
                      marginTop: '0.375rem',
                      fontSize: '0.75rem',
                      color: 'var(--color-error)',
                    }}>
                      {src.error_message}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                  background: statusCfg.bg, fontSize: '0.75rem', fontWeight: 500,
                  color: statusCfg.color,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: statusCfg.color,
                    animation: src.status === 'processing' ? 'pulse-soft 1.5s infinite' : 'none',
                  }} />
                  {statusCfg.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty guidance */}
      {sources.length === 0 && !uploading && (
        <div style={{
          textAlign: 'center', padding: '1rem', color: 'var(--color-text-tertiary)',
          fontSize: '0.8125rem',
        }}>
          Upload at least one processed source before using the canvas, tutor, or quiz workflows.
        </div>
      )}
    </div>
  );
}
