/**
 * SourceCard — Displays a single source with status indicator
 *
 * Shows: title, file type icon, status (uploaded/processing/ready/failed), chunk count.
 *
 * TODO: [Phase 1] Add delete action
 * TODO: [Phase 1] Add expandable chunk viewer
 */

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  uploaded: { color: 'var(--color-info)', label: 'Uploaded' },
  processing: { color: 'var(--color-warning)', label: 'Processing...' },
  ready: { color: 'var(--color-success)', label: 'Ready' },
  failed: { color: 'var(--color-error)', label: 'Failed' },
};

export function SourceCard({
  title,
  fileName,
  status,
  chunkCount,
}: {
  title: string;
  fileName: string;
  status: string;
  chunkCount: number;
}) {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.failed;

  return (
    <div
      className="elevated"
      style={{
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {/* File icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.25rem',
          flexShrink: 0,
        }}
      >
        📄
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
          {fileName}
          {status === 'ready' && ` · ${chunkCount} chunks`}
        </div>
      </div>

      {/* Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: statusConfig.color,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusConfig.color,
            animation: status === 'processing' ? 'pulse-soft 1.5s infinite' : 'none',
          }}
        />
        {statusConfig.label}
      </div>
    </div>
  );
}

export default SourceCard;
