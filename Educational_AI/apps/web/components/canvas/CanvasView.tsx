'use client';

import { useEffect } from 'react';

import {
  Background,
  Controls,
  Edge,
  EdgeMouseHandler,
  MarkerType,
  MiniMap,
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
  EvidenceSupport,
} from '../../lib/concept-map';
import CanvasInspector from './CanvasInspector';
import CanvasNode, { CanvasFlowNodeData } from './CanvasNode';

const nodeTypes = { concept: CanvasNode };
type FlowConceptNode = Node<CanvasFlowNodeData, 'concept'>;

const SUPPORT_STYLE: Record<EvidenceSupport, { color: string; stroke: string }> = {
  strong: {
    color: 'var(--color-success)',
    stroke: 'var(--color-success)',
  },
  partial: {
    color: 'var(--color-warning)',
    stroke: 'var(--color-warning)',
  },
  weak: {
    color: 'var(--color-error)',
    stroke: 'var(--color-error)',
  },
};

function toFlowNodes(
  nodes: ConceptNodeDTO[],
  selection: CanvasSelectionContext,
): FlowConceptNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: 'concept',
    position: { x: node.position_x, y: node.position_y },
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
    },
  }));
}

function toFlowEdges(
  edges: ConceptEdgeDTO[],
  selection: CanvasSelectionContext,
): Edge[] {
  return edges.map((edge) => {
    const supportStyle = SUPPORT_STYLE[edge.support];
    return {
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      type: 'smoothstep',
      label: edge.label,
      selected: selection?.type === 'edge' && selection.edge.id === edge.id,
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: supportStyle.stroke,
      },
      style: {
        stroke: supportStyle.stroke,
        strokeWidth: edge.uncertain ? 1.4 : 1.8,
        strokeDasharray: edge.uncertain ? '6 4' : undefined,
      },
      labelStyle: {
        fill: supportStyle.color,
        fontWeight: 700,
        fontSize: 11,
      },
      labelShowBg: true,
      labelBgStyle: {
        fill: 'var(--color-bg-elevated)',
        fillOpacity: 0.96,
        stroke: 'var(--color-border-primary)',
        strokeWidth: 1,
      },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 999,
    };
  });
}

function assessmentLabel(assessment: string) {
  switch (assessment) {
    case 'supported':
      return 'Grounded map';
    case 'weak_evidence':
      return 'Mixed support';
    case 'insufficient_grounding':
      return 'Insufficient grounding';
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
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowConceptNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const uncertainNodeCount = nodes.filter((node) => node.uncertain).length;
  const uncertainEdgeCount = edges.filter((edge) => edge.uncertain).length;
  const filledNodeCount = nodes.filter((node) => node.status !== 'skeleton').length;
  const skeletonNodeCount = nodes.filter((node) => node.status === 'skeleton').length;

  useEffect(() => {
    setFlowNodes(toFlowNodes(nodes, selection));
    setFlowEdges(toFlowEdges(edges, selection));
  }, [edges, nodes, selection, setFlowEdges, setFlowNodes]);

  const handleNodeClick: NodeMouseHandler<FlowConceptNode> = (_event, node) => {
    const selectedNode = nodes.find((candidate) => candidate.id === node.id);
    if (!selectedNode) {
      return;
    }
    onSelect({
      type: 'node',
      conceptMapId: conceptMap.id,
      node: selectedNode,
    });
  };

  const handleEdgeClick: EdgeMouseHandler<Edge> = (_event, edge) => {
    const selectedEdge = edges.find((candidate) => candidate.id === edge.id);
    if (!selectedEdge) {
      return;
    }
    const sourceLabel = nodes.find((candidate) => candidate.id === selectedEdge.source_node_id)?.label || 'Source';
    const targetLabel = nodes.find((candidate) => candidate.id === selectedEdge.target_node_id)?.label || 'Target';
    onSelect({
      type: 'edge',
      conceptMapId: conceptMap.id,
      edge: selectedEdge,
      sourceLabel,
      targetLabel,
    });
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: selection ? 'minmax(0, 1fr) minmax(280px, 34vw)' : 'minmax(0, 1fr)',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
                {assessmentLabel(conceptMap.support_assessment)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
              <span>{nodes.length} concepts</span>
              <span>{edges.length} relationships</span>
              <span>{filledNodeCount}/{nodes.length} nodes filled</span>
              <span>{skeletonNodeCount} skeleton</span>
              <span>{uncertainNodeCount + uncertainEdgeCount} tentative elements</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {generating && (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Regenerating map…
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
              {generating ? 'Regenerating…' : 'Regenerate Map'}
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
            nodesDraggable
            onNodeDragStop={(_, node) => {
              onSaveNode(node.id, {
                positionX: node.position.x,
                positionY: node.position.y,
              }).catch(() => undefined);
            }}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0.92), rgba(241,245,249,0.7))' }}
          >
            <Background color="rgba(148, 163, 184, 0.22)" gap={24} />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(15, 23, 42, 0.05)"
              nodeColor={(node) => {
                const support = (node.data as unknown as CanvasFlowNodeData).support;
                return SUPPORT_STYLE[support].stroke;
              }}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      {selection && (
        <CanvasInspector
          selection={selection}
          onClose={onClearSelection}
          onSaveNode={onSaveNode}
          onSaveEdge={onSaveEdge}
        />
      )}
    </div>
  );
}
