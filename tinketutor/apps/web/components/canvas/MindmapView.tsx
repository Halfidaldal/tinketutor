'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Background,
  Controls,
  Edge,
  Node,
  NodeMouseHandler,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';

import type { MindmapNode, MindmapTree } from '../../lib/concept-map';
import { useI18n } from '../../lib/i18n';
import MindmapTreeNode, { type MindmapFlowNodeData } from './MindmapTreeNode';

const nodeTypes = { mindmap: MindmapTreeNode };
type FlowMindmapNode = Node<MindmapFlowNodeData, 'mindmap'>;
const SYNTHETIC_ROOT_ID = '__mindmap_root__';

// --- Flatten recursive tree into flat lists ---

interface FlatNode {
  id: string;
  label: string;
  subtitle?: string;
  summary: string;
  guidingQuestion: string;
  parentId: string | null;
  childIds: string[];
  depth: number;
  isSyntheticRoot?: boolean;
}

function flattenTree(tree: MindmapTree, rootSubtitle: string): Map<string, FlatNode> {
  const flat = new Map<string, FlatNode>();
  const roots = Array.isArray(tree?.nodes) ? tree.nodes : [];
  const rootChildIds = roots.map((node) => node.id);

  flat.set(SYNTHETIC_ROOT_ID, {
    id: SYNTHETIC_ROOT_ID,
    label: tree?.title ?? '',
    subtitle: rootSubtitle,
    summary: rootSubtitle,
    guidingQuestion: '',
    parentId: null,
    childIds: rootChildIds,
    depth: 0,
    isSyntheticRoot: true,
  });

  function walk(node: MindmapNode, parentId: string | null, depth: number) {
    const children = Array.isArray(node.children) ? node.children : [];
    const childIds = children.map((c) => c.id);
    flat.set(node.id, {
      id: node.id,
      label: node.label ?? '',
      summary: node.summary ?? '',
      guidingQuestion: node.guiding_question ?? '',
      parentId,
      childIds,
      depth,
    });
    for (const child of children) {
      walk(child, node.id, depth + 1);
    }
  }

  for (const root of roots) {
    walk(root, SYNTHETIC_ROOT_ID, 1);
  }

  return flat;
}

// --- Tree layout ---

const H_GAP = 240;
const V_GAP = 72;

function layoutFlatTree(
  flatNodes: Map<string, FlatNode>,
  roots: string[],
  expandedSet: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let currentY = 0;

  function layoutSubtree(nodeId: string, depth: number): number {
    const node = flatNodes.get(nodeId);
    if (!node) {
      positions.set(nodeId, { x: depth * H_GAP, y: currentY });
      currentY += V_GAP;
      return currentY - V_GAP;
    }

    const visibleChildren = expandedSet.has(nodeId) ? node.childIds : [];

    if (visibleChildren.length === 0) {
      positions.set(nodeId, { x: depth * H_GAP, y: currentY });
      currentY += V_GAP;
      return positions.get(nodeId)!.y;
    }

    const childYs: number[] = [];
    for (const childId of visibleChildren) {
      childYs.push(layoutSubtree(childId, depth + 1));
    }

    const midY = (childYs[0] + childYs[childYs.length - 1]) / 2;
    positions.set(nodeId, { x: depth * H_GAP, y: midY });
    return midY;
  }

  for (const rootId of roots) {
    layoutSubtree(rootId, 0);
  }

  return positions;
}

function collectVisibleIds(
  flatNodes: Map<string, FlatNode>,
  roots: string[],
  expandedSet: Set<string>,
): Set<string> {
  const visible = new Set<string>();

  function walk(nodeId: string) {
    visible.add(nodeId);
    const node = flatNodes.get(nodeId);
    if (node && expandedSet.has(nodeId)) {
      for (const childId of node.childIds) {
        walk(childId);
      }
    }
  }

  for (const rootId of roots) {
    walk(rootId);
  }
  return visible;
}

// --- Detail Panel ---

function MindmapDetailPanel({
  node,
  onClose,
}: {
  node: FlatNode;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <aside
      style={{
        width: '100%',
        minWidth: 0,
        borderLeft: '1px solid var(--color-border-primary)',
        background: 'var(--color-bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '0.9rem 1rem',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'grid', gap: '0.12rem' }}>
          <span
            style={{
              fontSize: '0.6875rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {t('mindmap.conceptDetail')}
          </span>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {node.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.5rem',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {t('common.close')}
        </button>
      </div>

      <div style={{ padding: '1rem', overflow: 'auto', display: 'grid', gap: '0.9rem' }}>
        {/* Summary */}
        <div
          className="surface"
          style={{ padding: '0.875rem', display: 'grid', gap: '0.5rem' }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {t('mindmap.summary')}
          </div>
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
            }}
          >
            {node.summary}
          </div>
        </div>

        {/* Guiding Question */}
        {node.guidingQuestion && (
          <div
            style={{
              padding: '0.7rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              fontSize: '0.78rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {t('mindmap.guidingQuestion')}
            </strong>{' '}
            {node.guidingQuestion}
          </div>
        )}

        {/* Depth / Children info */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            fontSize: '0.72rem',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>{t('mindmap.depth')}: {Math.max(1, node.depth)}</span>
          <span>
            {node.childIds.length === 0
              ? t('mindmap.leafNode')
              : t('mindmap.childCount', { values: { count: node.childIds.length } })}
          </span>
        </div>
      </div>
    </aside>
  );
}

// --- Main Component ---

export default function MindmapView({
  tree,
  sourceCount,
  onRegenerate,
  generating,
}: {
  tree: MindmapTree;
  sourceCount: number;
  onRegenerate: () => Promise<void>;
  generating: boolean;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowMindmapNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [paneWidth, setPaneWidth] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string> | null>(null);

  const rootSubtitle = useMemo(
    () => t('mindmap.basedOnSources', { values: { count: sourceCount } }),
    [sourceCount, t],
  );

  // Flatten the tree once
  const flatNodes = useMemo(() => flattenTree(tree, rootSubtitle), [tree, rootSubtitle]);
  const rootIds = useMemo(
    () => (flatNodes.has(SYNTHETIC_ROOT_ID) ? [SYNTHETIC_ROOT_ID] : []),
    [flatNodes],
  );
  const topLevelThemeCount = useMemo(
    () => (Array.isArray(tree?.nodes) ? tree.nodes.length : 0),
    [tree],
  );

  // Count all nodes recursively
  const totalNodeCount = useMemo(
    () => flatNodes.size - (flatNodes.has(SYNTHETIC_ROOT_ID) ? 1 : 0),
    [flatNodes],
  );

  // Default expanded state: expand root, themes, and concept level.
  const defaultExpanded = useMemo(() => {
    const expanded = new Set<string>();
    for (const [id, node] of flatNodes) {
      if (node.depth <= 2) {
        expanded.add(id);
      }
    }
    return expanded;
  }, [flatNodes]);

  const expanded = useMemo(() => {
    return expandedNodes ?? defaultExpanded;
  }, [expandedNodes, defaultExpanded]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const base = prev ?? defaultExpanded;
      const next = new Set(base);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, [defaultExpanded]);

  // Compute flow nodes
  const computedFlowNodes = useMemo((): FlowMindmapNode[] => {
    const visibleIds = collectVisibleIds(flatNodes, rootIds, expanded);
    const positions = layoutFlatTree(flatNodes, rootIds, expanded);
    const result: FlowMindmapNode[] = [];

    for (const nodeId of visibleIds) {
      const node = flatNodes.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;

      result.push({
        id: node.id,
        type: 'mindmap',
        position: { x: pos.x, y: pos.y },
        selected: selectedNodeId === node.id,
        data: {
          label: node.label,
          subtitle: node.subtitle,
          depth: node.depth,
          hasChildren: node.childIds.length > 0,
          expanded: expanded.has(node.id),
          onToggleExpand: toggleExpand,
          nodeId: node.id,
          isSyntheticRoot: node.isSyntheticRoot,
        },
      });
    }
    return result;
  }, [flatNodes, rootIds, expanded, selectedNodeId, toggleExpand]);

  // Compute flow edges (parent → child for visible nodes)
  const computedFlowEdges = useMemo((): Edge[] => {
    const visibleIds = collectVisibleIds(flatNodes, rootIds, expanded);
    const edgeList: Edge[] = [];

    for (const nodeId of visibleIds) {
      const node = flatNodes.get(nodeId);
      if (!node || !node.parentId || !visibleIds.has(node.parentId)) continue;
      edgeList.push({
        id: `e-${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        type: 'default',
        animated: false,
        style: {
          stroke: 'var(--color-accent-primary)',
          strokeWidth: 1.5,
          opacity: 0.55,
        },
      });
    }
    return edgeList;
  }, [flatNodes, rootIds, expanded]);

  // Sync to ReactFlow state
  useEffect(() => {
    setFlowNodes(computedFlowNodes);
  }, [computedFlowNodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(computedFlowEdges);
  }, [computedFlowEdges, setFlowEdges]);

  // Track pane width for responsive detail panel
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setPaneWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick: NodeMouseHandler<FlowMindmapNode> = (_event, node) => {
    if (node.id === SYNTHETIC_ROOT_ID) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId(node.id);
  };

  const selectedFlatNode = selectedNodeId ? flatNodes.get(selectedNodeId) ?? null : null;
  const showSidePanel = Boolean(selectedFlatNode && paneWidth >= 900);

  return (
    <div
      ref={rootRef}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: showSidePanel ? 'row' : 'column',
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header bar */}
        <div
          className="glass"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.9rem 1.1rem',
            borderBottom: '1px solid var(--color-border-primary)',
          }}
        >
          <div style={{ display: 'grid', gap: '0.18rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {tree.title}
              </span>
              <span
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: 999,
                  border: '1px solid var(--color-border-accent)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-accent-primary)',
                  fontWeight: 600,
                }}
              >
                {t('mindmap.hierarchicalTree')}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '0.65rem',
                flexWrap: 'wrap',
                fontSize: '0.72rem',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span>{t('mindmap.totalConcepts', { values: { count: totalNodeCount } })}</span>
              <span>{t('mindmap.topLevelThemes', { values: { count: topLevelThemeCount } })}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {generating && (
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                {t('mindmap.regenerating')}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setExpandedNodes(null);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('mindmap.resetView')}
            </button>
            <button
              type="button"
              onClick={() => onRegenerate()}
              disabled={generating}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                opacity: generating ? 0.6 : 1,
                cursor: generating ? 'not-allowed' : 'pointer',
              }}
            >
              {generating ? t('mindmap.regenerating') : t('mindmap.regenerate')}
            </button>
          </div>
        </div>

        {/* ReactFlow canvas */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            fitView
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            nodesConnectable={false}
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--color-bg-primary)' }}
          >
            <Background color="rgba(13, 148, 136, 0.08)" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      {/* Detail panel */}
      {selectedFlatNode && (
        <div
          style={{
            flex: showSidePanel ? '0 0 min(320px, 34vw)' : '0 0 auto',
            minWidth: showSidePanel ? 280 : 0,
            maxHeight: showSidePanel ? 'none' : '42%',
            minHeight: 0,
            overflow: 'auto',
            transition: 'max-height var(--transition-fast), flex-basis var(--transition-fast)',
          }}
        >
          <MindmapDetailPanel
            node={selectedFlatNode}
            onClose={() => setSelectedNodeId(null)}
          />
        </div>
      )}
    </div>
  );
}
