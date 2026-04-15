'use client';

import { Handle, NodeProps, Position } from '@xyflow/react';

export interface MindmapFlowNodeData extends Record<string, unknown> {
  label: string;
  subtitle?: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpand?: (nodeId: string) => void;
  nodeId: string;
  isSyntheticRoot?: boolean;
}

const DEPTH_COLORS = [
  'var(--color-accent-primary)',
  'var(--color-accent-secondary)',
  'var(--color-text-tertiary)',
] as const;

export default function MindmapTreeNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as MindmapFlowNodeData;
  const dotColor = DEPTH_COLORS[Math.min(data.depth, DEPTH_COLORS.length - 1)];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-full)',
        border: `1.5px solid ${selected ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
        background: selected ? 'var(--color-accent-glow)' : 'var(--color-bg-elevated)',
        boxShadow: selected
          ? '0 0 0 2px var(--color-accent-primary), var(--shadow-md)'
          : 'var(--shadow-sm)',
        cursor: 'pointer',
        transition: 'box-shadow 120ms ease, border-color 120ms ease, background 120ms ease',
        maxWidth: 280,
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

      {/* Depth-colored dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />

      <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0, flex: 1 }}>
        {/* Label */}
        <span
          style={{
            fontSize: data.depth === 0 ? '0.85rem' : '0.8125rem',
            fontWeight: data.depth === 0 ? 700 : 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {data.label}
        </span>

        {data.subtitle && (
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.25,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {data.subtitle}
          </span>
        )}
      </div>

      {/* Expand/collapse chevron */}
      {data.hasChildren && !data.isSyntheticRoot && (
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
            alignSelf: 'center',
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
