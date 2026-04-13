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
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpand?: (nodeId: string) => void;
  nodeId: string;
}

const SUPPORT_DOT: Record<EvidenceSupport, string> = {
  strong: 'var(--color-success)',
  partial: 'var(--color-warning)',
  weak: 'var(--color-error)',
};

const STATUS_BG: Record<NodeStatus, string> = {
  skeleton: 'var(--color-warning-bg)',
  student_filled: 'var(--color-success-bg)',
  ai_generated: 'var(--color-accent-glow)',
  verified: 'color-mix(in srgb, var(--color-node-verified) 12%, var(--color-bg-elevated))',
};

export default function CanvasNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as CanvasFlowNodeData;
  const dotColor = SUPPORT_DOT[data.support];
  const bg = STATUS_BG[data.status];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-full)',
        border: `1.5px solid ${selected ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
        background: selected ? 'var(--color-accent-glow)' : bg,
        boxShadow: selected
          ? '0 0 0 2px var(--color-accent-primary), var(--shadow-md)'
          : 'var(--shadow-sm)',
        cursor: 'pointer',
        transition: 'box-shadow 120ms ease, border-color 120ms ease, background 120ms ease',
        maxWidth: 220,
        minWidth: 0,
      }}
    >
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />

      {/* Support dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.label}
      </span>

      {/* Expand/collapse chevron */}
      {data.hasChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleExpand?.(data.nodeId);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-primary)',
            fontSize: '0.6875rem',
            color: 'var(--color-text-tertiary)',
            flexShrink: 0,
            cursor: 'pointer',
            transition: 'transform 150ms ease',
            transform: data.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          ›
        </button>
      )}

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
