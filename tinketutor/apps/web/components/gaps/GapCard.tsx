import Link from 'next/link';

import type { GapFindingDTO } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function getFocusHref(notebookId: string, finding: GapFindingDTO): string | null {
  if (finding.linked_node_ids.length > 0) {
    return `/workspace/${notebookId}/canvas?focusId=${finding.linked_node_ids[0]}`;
  }
  if (finding.linked_edge_ids.length > 0) {
    return `/workspace/${notebookId}/canvas?focusId=${finding.linked_edge_ids[0]}`;
  }
  return null;
}

export function GapCard({
  finding,
  notebookId,
  onStartQuiz,
}: {
  finding: GapFindingDTO;
  notebookId: string;
  onStartQuiz: (topic: string) => void;
}) {
  const { t } = useI18n();
  const focusHref = getFocusHref(notebookId, finding);
  const confidencePercent = Math.round(finding.confidence * 100);
  const confidenceColor = finding.confidence >= 0.75
    ? 'var(--color-error)'
    : finding.confidence >= 0.45
      ? 'var(--color-warning)'
      : 'var(--color-info)';

  return (
    <div className="surface" style={{ padding: '1.1rem 1.2rem', display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '0.35rem', minWidth: 0, flex: '1 1 340px' }}>
          <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {finding.topic}
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {finding.description}
          </p>
        </div>

        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            border: `3px solid ${confidenceColor}`,
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.76rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            flexShrink: 0,
          }}
        >
          {confidencePercent}%
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {finding.evidence.map((evidence) => (
          <span
            key={`${evidence.type}:${evidence.reference_id}`}
            style={{
              padding: '0.28rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              fontSize: '0.7rem',
              color: 'var(--color-text-secondary)',
            }}
            title={evidence.detail}
          >
            {(() => {
              const labelKey = `gapCard.evidenceLabels.${evidence.type}`;
              const label = t(labelKey);
              return label === labelKey ? evidence.type : label;
            })()}
          </span>
        ))}
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
        {finding.source_ids.length === 1
          ? t('gapCard.sourcesOne')
          : t('gapCard.sourcesMany', { values: { count: finding.source_ids.length } })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {focusHref && (
            <Link
              href={focusHref}
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--color-accent-primary)',
                textDecoration: 'none',
              }}
            >
              {t('gapCard.openInKnowledgeMap')}
            </Link>
          )}
          {finding.suggested_next_action && (
            <span style={{ fontSize: '0.76rem', color: 'var(--color-text-tertiary)' }}>
              {finding.suggested_next_action}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onStartQuiz(finding.topic)}
          style={{
            padding: '0.45rem 0.78rem',
            background: 'var(--color-accent-glow)',
            border: '1px solid var(--color-border-accent)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.76rem',
            fontWeight: 600,
            color: 'var(--color-accent-primary)',
            cursor: 'pointer',
          }}
        >
          {t('gapCard.startQuiz')}
        </button>
      </div>
    </div>
  );
}

export default GapCard;
