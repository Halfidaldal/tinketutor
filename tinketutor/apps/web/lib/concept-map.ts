export type EvidenceSupport = 'strong' | 'partial' | 'weak';
export type NodeStatus = 'skeleton' | 'student_filled' | 'ai_generated' | 'verified';
export type SupportAssessment =
  | 'supported'
  | 'weak_evidence'
  | 'insufficient_grounding'
  | 'no_ready_sources'
  | 'no_matching_evidence'
  | 'missing_traceability';
export type MapGenerationStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface ConceptEvidenceItem {
  source_id: string;
  source_title: string;
  chunk_id: string;
  citation_ids: string[];
  citation_anchor_ids: string[];
  snippet_text: string;
  page_start: number;
  page_end: number;
  section_title?: string | null;
  rank: number;
  score: number;
  support: EvidenceSupport;
}

export interface ConceptNodeDTO {
  id: string;
  notebook_id: string;
  concept_map_id: string;
  stable_key: string;
  label: string;
  summary: string;
  note: string;
  guiding_question?: string | null;
  status: NodeStatus;
  support: EvidenceSupport;
  uncertain: boolean;
  needs_refinement: boolean;
  citation_ids: string[];
  citation_anchor_ids: string[];
  evidence_items: ConceptEvidenceItem[];
  source_ids: string[];
  source_coverage_count: number;
  editable: boolean;
  created_by: 'ai' | 'student';
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
}

export interface ConceptEdgeDTO {
  id: string;
  notebook_id: string;
  concept_map_id: string;
  stable_key: string;
  source_node_id: string;
  target_node_id: string;
  label: string;
  summary: string;
  support: EvidenceSupport;
  uncertain: boolean;
  needs_refinement: boolean;
  citation_ids: string[];
  citation_anchor_ids: string[];
  evidence_items: ConceptEvidenceItem[];
  source_ids: string[];
  source_coverage_count: number;
  editable: boolean;
  created_by: 'ai' | 'student';
  created_at: string;
  updated_at: string;
}

export interface ConceptMapDTO {
  id: string;
  notebook_id: string;
  user_id: string;
  title: string;
  source_ids: string[];
  generation_status: MapGenerationStatus;
  generation_strategy: string;
  support_assessment: SupportAssessment;
  insufficient_grounding: boolean;
  insufficiency_reason?: string | null;
  diagnostics: Record<string, unknown>;
  node_ids: string[];
  edge_ids: string[];
  created_at: string;
  updated_at: string;
  generated_at?: string | null;
}

export interface ConceptMapEnvelope {
  concept_map: ConceptMapDTO;
  nodes: ConceptNodeDTO[];
  edges: ConceptEdgeDTO[];
}

export interface NodeSelectionContext {
  type: 'node';
  conceptMapId: string;
  node: ConceptNodeDTO;
}

export interface EdgeSelectionContext {
  type: 'edge';
  conceptMapId: string;
  edge: ConceptEdgeDTO;
  sourceLabel: string;
  targetLabel: string;
}

export type CanvasSelectionContext =
  | NodeSelectionContext
  | EdgeSelectionContext
  | null;

export function getSelectionLabel(selection: CanvasSelectionContext): string {
  if (!selection) {
    return '';
  }
  if (selection.type === 'node') {
    return selection.node.label;
  }
  return `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`;
}

// ============================================================
// Mindmap Tree Types (recursive hierarchy from LLM)
// ============================================================

export interface MindmapNode {
  id: string;
  label: string;
  summary: string;
  guiding_question: string;
  children: MindmapNode[];
}

export interface MindmapTree {
  title: string;
  nodes: MindmapNode[];
}
