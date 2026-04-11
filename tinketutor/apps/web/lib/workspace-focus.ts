import type {
  CanvasSelectionContext,
  ConceptEdgeDTO,
  ConceptMapDTO,
  ConceptNodeDTO,
} from './concept-map';

export interface CitationResolution {
  citation: {
    id: string;
    source_title: string;
    page_start: number;
    page_end: number;
    section_title?: string | null;
  };
  chunk: {
    content: string;
  };
  citation_anchors: Array<{
    id: string;
    snippet_text: string;
  }>;
}

export interface WorkspaceCitationFocus {
  type: 'citation';
  citationId: string;
  resolution: CitationResolution;
}

export type WorkspaceFocus = Exclude<CanvasSelectionContext, null> | WorkspaceCitationFocus | null;

export function toCanvasSelection(focus: WorkspaceFocus): CanvasSelectionContext {
  if (!focus || focus.type === 'citation') {
    return null;
  }
  return focus;
}

export function syncWorkspaceFocusWithGraph(
  focus: WorkspaceFocus,
  conceptMap: ConceptMapDTO | null,
  nodes: ConceptNodeDTO[],
  edges: ConceptEdgeDTO[],
): WorkspaceFocus {
  if (!focus) {
    return null;
  }

  if (focus.type === 'citation') {
    return focus;
  }

  if (!conceptMap || focus.conceptMapId !== conceptMap.id) {
    return null;
  }

  if (focus.type === 'node') {
    const node = nodes.find((candidate) => candidate.id === focus.node.id);
    return node ? { type: 'node', conceptMapId: conceptMap.id, node } : null;
  }

  const edge = edges.find((candidate) => candidate.id === focus.edge.id);
  if (!edge) {
    return null;
  }

  const sourceLabel = nodes.find((candidate) => candidate.id === edge.source_node_id)?.label || focus.sourceLabel;
  const targetLabel = nodes.find((candidate) => candidate.id === edge.target_node_id)?.label || focus.targetLabel;

  return {
    type: 'edge',
    conceptMapId: conceptMap.id,
    edge,
    sourceLabel,
    targetLabel,
  };
}
