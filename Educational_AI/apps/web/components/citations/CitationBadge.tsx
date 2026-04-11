/**
 * CitationBadge - inline citation indicator.
 *
 * Renders a clickable badge like "Slides p.14".
 * The surrounding retrieval UI decides how to present the stored citation detail.
 *
 * Per TG-4: Every AI-generated output has clickable source citations.
 */

export function CitationBadge({
  sourceTitle,
  pageStart,
  pageEnd,
  onClick,
}: {
  sourceTitle: string;
  pageStart: number;
  pageEnd: number;
  onClick?: () => void;
}) {
  const pageLabel = pageStart === pageEnd
    ? `p.${pageStart}`
    : `p.${pageStart}-${pageEnd}`;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.125rem 0.5rem',
        background: 'var(--color-accent-glow)',
        border: '1px solid var(--color-border-accent)',
        borderRadius: 'var(--radius-full)',
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: 'var(--color-accent-primary-hover)',
        cursor: 'pointer',
        transition: 'var(--transition-fast)',
        whiteSpace: 'nowrap',
      }}
    >
      📄 {sourceTitle} {pageLabel}
    </button>
  );
}

export default CitationBadge;
