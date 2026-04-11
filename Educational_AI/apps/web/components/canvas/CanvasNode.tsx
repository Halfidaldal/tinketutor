'use client';

import { Handle, NodeProps, Position } from '@xyflow/react';

import type { EvidenceSupport, NodeStatus } from '../../lib/concept-map';

export interface CanvasFlowNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  guidingQuestion?: string | null;
  status: NodeStatus;
  support: EvidenceSupport;
  uncertain: boolean;
  needsRefinement: boolean;
  citationCount: number;
}

const SUPPORT_STYLE: Record<EvidenceSupport, { border: string; background: string; badge: string; badgeBg: string }> = {
  strong: {
    border: 'var(--color-success)',
    background: 'color-mix(in srgb, var(--color-success) 8%, var(--color-bg-elevated))',
    badge: 'var(--color-success)',
    badgeBg: 'var(--color-success-bg)',
  },
  partial: {
    border: 'var(--color-warning)',
    background: 'color-mix(in srgb, var(--color-warning) 8%, var(--color-bg-elevated))',
    badge: 'var(--color-warning)',
    badgeBg: 'var(--color-warning-bg)',
  },
  weak: {
    border: 'var(--color-error)',
    background: 'color-mix(in srgb, var(--color-error) 6%, var(--color-bg-elevated))',
    badge: 'var(--color-error)',
    badgeBg: 'var(--color-error-bg)',
  },
};

const STATUS_STYLE: Record<NodeStatus, { border: string; background: string; pillBg: string; pillColor: string; label: string }> = {
  skeleton: {
    border: 'var(--color-node-skeleton)',
    background: 'color-mix(in srgb, var(--color-node-skeleton) 10%, var(--color-bg-elevated))',
    pillBg: 'var(--color-warning-bg)',
    pillColor: 'var(--color-warning)',
    label: 'Fill in',
  },
  student_filled: {
    border: 'var(--color-node-filled)',
    background: 'color-mix(in srgb, var(--color-node-filled) 10%, var(--color-bg-elevated))',
    pillBg: 'var(--color-success-bg)',
    pillColor: 'var(--color-success)',
    label: 'Student filled',
  },
  ai_generated: {
    border: 'var(--color-node-ai)',
    background: 'color-mix(in srgb, var(--color-node-ai) 7%, var(--color-bg-elevated))',
    pillBg: 'var(--color-accent-glow)',
    pillColor: 'var(--color-accent-primary)',
    label: 'AI generated',
  },
  verified: {
    border: 'var(--color-node-verified)',
    background: 'color-mix(in srgb, var(--color-node-verified) 9%, var(--color-bg-elevated))',
    pillBg: 'color-mix(in srgb, var(--color-node-verified) 18%, white)',
    pillColor: 'var(--color-node-verified)',
    label: 'Verified',
  },
};

export default function CanvasNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as CanvasFlowNodeData;
  const supportStyle = SUPPORT_STYLE[data.support];
  const statusStyle = STATUS_STYLE[data.status];
  const bodyCopy = data.status === 'skeleton'
    ? data.guidingQuestion || 'Complete this concept in the inspector using notebook evidence.'
    : data.summary || 'Open the inspector to refine this concept.';
  const supportLabel = data.uncertain ? 'Tentative grounding' : SUPPORT_STYLE[data.support] ? data.support : 'Grounded';

  return (
    <div
      style={{
        minWidth: 220,
        maxWidth: 280,
        padding: '0.9rem 1rem',
        borderRadius: 18,
        border: `1.5px ${data.status === 'skeleton' ? 'dashed' : 'solid'} ${statusStyle.border}`,
        background: statusStyle.background,
        boxShadow: selected
          ? '0 0 0 1px var(--color-accent-primary), 0 12px 32px rgba(15, 23, 42, 0.16)'
          : '0 10px 24px rgba(15, 23, 42, 0.08)',
        color: 'var(--color-text-primary)',
        transition: 'box-shadow 120ms ease, transform 120ms ease',
      }}
    >
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.55rem' }}>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: 'fit-content',
              padding: '0.15rem 0.45rem',
              borderRadius: 999,
              background: statusStyle.pillBg,
              color: statusStyle.pillColor,
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {statusStyle.label}
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, lineHeight: 1.35 }}>
            {data.label}
          </div>
        </div>
        <div
          style={{
            padding: '0.15rem 0.45rem',
            borderRadius: 999,
            background: data.uncertain ? 'var(--color-warning-bg)' : supportStyle.badgeBg,
            color: data.uncertain ? 'var(--color-warning)' : supportStyle.badge,
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {supportLabel}
        </div>
      </div>

      <div style={{ fontSize: '0.74rem', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
        {bodyCopy}
      </div>

      <div style={{ marginTop: '0.7rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>
        <span>
          {data.status === 'skeleton'
            ? 'Awaiting student completion'
            : data.status === 'student_filled'
              ? 'Completed in inspector'
              : data.needsRefinement
                ? 'Needs refinement'
                : 'Grounded concept'}
        </span>
        <span>{data.citationCount} citations</span>
      </div>

      <Handle
        id="source"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}
