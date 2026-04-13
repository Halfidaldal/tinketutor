'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Background,
  Controls,
  Edge,
  EdgeMouseHandler,
  Node,
  NodeMouseHandler,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';

import type {
  CanvasSelectionContext,
  ConceptEdgeDTO,
  ConceptMapDTO,
  ConceptNodeDTO,
} from '../../lib/concept-map';
import { useI18n } from '../../lib/i18n';
import CanvasInspector from './CanvasInspector';
import CanvasNode, { CanvasFlowNodeData } from './CanvasNode';

const nodeTypes = { concept: CanvasNode };
type FlowConceptNode = Node<CanvasFlowNodeData, 'concept'>;

// --- Tree layout helpers ---

interface TreeNode {
  id: string;
  children: string[];
}

function buildTree(nodes: ConceptNodeDTO[], edges: ConceptEdgeDTO[]): Map<string, TreeNode> {
  const tree = new Map<string, TreeNode>();
  for (const node of nodes) {
    tree.set(node.id, { id: node.id, children: [] });
  }
  for (const edge of edges) {
    const parent = tree.get(edge.source_node_id);
    if (parent && tree.has(edge.target_node_id)) {
      parent.children.push(edge.target_node_id);
    }
  }
  return tree;
}

function findRoots(nodes: ConceptNodeDTO[], edges: ConceptEdgeDTO[]): string[] {
  const targets = new Set(edges.map((e) => e.target_node_id));
  const roots = nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);
  return roots.length > 0 ? roots : nodes.length > 0 ? [nodes[0].id] : [];
}

const H_GAP = 220;
const V_GAP = 56;

function layoutTree(
  tree: Map<string, TreeNode>,
  roots: string[],
  expandedSet: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let currentY = 0;

  function layoutSubtree(nodeId: string, depth: number): number {
    const treeNode = tree.get(nodeId);
    const visibleChildren =
      treeNode && expandedSet.has(nodeId)
        ? treeNode.children.filter((id) => tree.has(id))
        : [];

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
  tree: Map<string, TreeNode>,
  roots: string[],
  expandedSet: Set<string>,
): Set<string> {
  const visible = new Set<string>();

  function walk(nodeId: string) {
    visible.add(nodeId);
    const treeNode = tree.get(nodeId);
    if (treeNode && expandedSet.has(nodeId)) {
      for (const childId of treeNode.children) {
        if (tree.has(childId)) {
          walk(childId);
        }
      }
    }
  }

  for (const rootId of roots) {
    walk(rootId);
  }
  return visible;
}

// --- Component ---

function assessmentLabel(assessment: string, t: (key: string) => string) {
  switch (assessment) {
    case 'supported':
      return t('knowledgeMapView.groundedMap');
    case 'weak_evidence':
      return t('knowledgeMapView.mixedSupport');
    case 'insufficient_grounding':
      return t('knowledgeMapView.insufficientGrounding');
    default:
      return assessment.replace(/_/g, ' ');
  }
}

export default function CanvasView({
  conceptMap,
  nodes,
  edges,
  selection,
  onSelect,
  onClearSelection,
  onRegenerate,
  onSaveNode,
  onSaveEdge,
  generating,
}: {
  conceptMap: ConceptMapDTO;
  nodes: ConceptNodeDTO[];
  edges: ConceptEdgeDTO[];
  selection: CanvasSelectionContext;
  onSelect: (selection: CanvasSelectionContext) => void;
  onClearSelection: () => void;
  onRegenerate: () => Promise<void>;
  onSaveNode: (nodeId: string, updates: {
    label?: string;
    summary?: string;
    note?: string;
    positionX?: number;
    positionY?: number;
  }) => Promise<void>;
  onSaveEdge: (edgeId: string, updates: {
    label?: string;
    summary?: string;
  }) => Promise<void>;
  generating: boolean;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowConceptNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [paneWidth, setPaneWidth] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string> | null>(null);

  // Memoize tree structure so it doesn't cause infinite effect loops
  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const roots = useMemo(() => findRoots(nodes, edges), [nodes, edges]);

  // Seed expanded set on first meaningful data
  const expanded = useMemo(() => {
    if (expandedNodes !== null) return expandedNodes;
    return new Set(roots);
  }, [expandedNodes, roots]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const base = prev ?? new Set(roots);
      const next = new Set(base);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, [roots]);

  // Derive child-has-children lookup
  const hasChildrenMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const [id, node] of tree.entries()) {
      map.set(id, node.children.length > 0);
    }
    return map;
  }, [tree]);

  // Compute flow nodes and edges from the tree + expanded state
  // This runs synchronously during render via useMemo — no useEffect needed
  const computedFlowNodes = useMemo((): FlowConceptNode[] => {
    const visibleIds = collectVisibleIds(tree, roots, expanded);
    const positions = layoutTree(tree, roots, expanded);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const result: FlowConceptNode[] = [];

    for (const nodeId of visibleIds) {
      const node = nodeMap.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;

      result.push({
        id: node.id,
        type: 'concept',
        position: { x: pos.x, y: pos.y },
        selected: selection?.type === 'node' && selection.node.id === node.id,
        data: {
          label: node.label,
          summary: node.summary,
          guidingQuestion: node.guiding_question,
          status: node.status,
          support: node.support,
          uncertain: node.uncertain,
          needsRefinement: node.needs_refinement,
          citationCount: node.citation_ids.length,
          hasChildren: hasChildrenMap.get(node.id) ?? false,
          expanded: expanded.has(node.id),
          onToggleExpand: toggleExpand,
          nodeId: node.id,
        },
      });
    }
    return result;
  }, [nodes, tree, roots, expanded, selection, hasChildrenMap, toggleExpand]);

  const computedFlowEdges = useMemo((): Edge[] => {
    const visibleIds = collectVisibleIds(tree, roots, expanded);
    return edges
      .filter((edge) => visibleIds.has(edge.source_node_id) && visibleIds.has(edge.target_node_id))
      .map((edge) => ({
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        type: 'bezier',
        animated: false,
        style: {
          stroke: 'var(--color-border-secondary)',
          strokeWidth: 1.5,
        },
      }));
  }, [edges, tree, roots, expanded]);

  // Sync computed values to ReactFlow state
  useEffect(() => {
    setFlowNodes(computedFlowNodes);
  }, [computedFlowNodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(computedFlowEdges);
  }, [computedFlowEdges, setFlowEdges]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setPaneWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick: NodeMouseHandler<FlowConceptNode> = (_event, node) => {
    const selectedNode = nodes.find((c) => c.id === node.id);
    if (!selectedNode) return;
    onSelect({ type: 'node', conceptMapId: conceptMap.id, node: selectedNode });
  };

  const handleEdgeClick: EdgeMouseHandler<Edge> = (_event, edge) => {
    const selectedEdge = edges.find((c) => c.id === edge.id);
    if (!selectedEdge) return;
    const sourceLabel = nodes.find((c) => c.id === selectedEdge.source_node_id)?.label || 'Source';
    const targetLabel = nodes.find((c) => c.id === selectedEdge.target_node_id)?.label || 'Target';
    onSelect({ type: 'edge', conceptMapId: conceptMap.id, edge: selectedEdge, sourceLabel, targetLabel });
  };

  const showSideInspector = Boolean(selection && paneWidth >= 1040);
  const filledNodeCount = nodes.filter((node) => node.status !== 'skeleton').length;
  const skeletonNodeCount = nodes.filter((node) => node.status === 'skeleton').length;

  return (
    <div
      ref={rootRef}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: showSideInspector ? 'row' : 'column',
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                {conceptMap.title}
              </span>
              <span
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: 999,
                  border: '1px solid var(--color-border-secondary)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {assessmentLabel(conceptMap.support_assessment, t)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
              <span>{t('knowledgeMapView.conceptsCount', { values: { count: nodes.length } })}</span>
              <span>{t('knowledgeMapView.relationshipsCount', { values: { count: edges.length } })}</span>
              <span>{t('knowledgeMapView.filledNodes', { values: { count: filledNodeCount, total: nodes.length } })}</span>
              <span>{t('knowledgeMapView.skeletonCount', { values: { count: skeletonNodeCount } })}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {generating && (
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                {t('knowledgeMapView.regeneratingMap')}
              </span>
            )}
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
              }}
            >
              {generating ? t('knowledgeMapPage.regenerating') : t('knowledgeMapView.regenerateMap')}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            fitView
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={onClearSelection}
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

      {selection && (
        <div
          style={{
            flex: showSideInspector ? '0 0 min(320px, 34vw)' : '0 0 auto',
            minWidth: showSideInspector ? 300 : 0,
            maxHeight: showSideInspector ? 'none' : '42%',
            minHeight: 0,
            overflow: 'auto',
            transition: 'max-height var(--transition-fast), flex-basis var(--transition-fast)',
          }}
        >
          <CanvasInspector
            selection={selection}
            onClose={onClearSelection}
            onSaveNode={onSaveNode}
            onSaveEdge={onSaveEdge}
            stacked={!showSideInspector}
          />
        </div>
      )}
    </div>
  );
}
