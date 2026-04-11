import assert from 'node:assert/strict';
import test from 'node:test';

import type { ConceptEdgeDTO, ConceptMapDTO, ConceptNodeDTO } from './concept-map';
import { syncWorkspaceFocusWithGraph, toCanvasSelection, type WorkspaceFocus } from './workspace-focus';

const conceptMap: ConceptMapDTO = {
  id: 'map-1',
  notebook_id: 'nb-1',
  user_id: 'user-1',
  title: 'Knowledge Map',
  source_ids: ['source-1'],
  generation_status: 'ready',
  generation_strategy: 'deterministic',
  support_assessment: 'supported',
  insufficient_grounding: false,
  diagnostics: {},
  node_ids: ['node-1', 'node-2'],
  edge_ids: ['edge-1'],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const nodes: ConceptNodeDTO[] = [
  {
    id: 'node-1',
    notebook_id: 'nb-1',
    concept_map_id: 'map-1',
    stable_key: 'node-1',
    label: 'Photosynthesis',
    summary: 'Updated summary',
    note: '',
    status: 'ai_generated',
    support: 'strong',
    uncertain: false,
    needs_refinement: false,
    citation_ids: [],
    citation_anchor_ids: [],
    evidence_items: [],
    source_ids: [],
    source_coverage_count: 1,
    editable: true,
    created_by: 'ai',
    position_x: 100,
    position_y: 100,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'node-2',
    notebook_id: 'nb-1',
    concept_map_id: 'map-1',
    stable_key: 'node-2',
    label: 'ATP',
    summary: 'ATP summary',
    note: '',
    status: 'ai_generated',
    support: 'strong',
    uncertain: false,
    needs_refinement: false,
    citation_ids: [],
    citation_anchor_ids: [],
    evidence_items: [],
    source_ids: [],
    source_coverage_count: 1,
    editable: true,
    created_by: 'ai',
    position_x: 200,
    position_y: 200,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const edges: ConceptEdgeDTO[] = [
  {
    id: 'edge-1',
    notebook_id: 'nb-1',
    concept_map_id: 'map-1',
    stable_key: 'edge-1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    label: 'produces',
    summary: 'Updated relationship',
    support: 'strong',
    uncertain: false,
    needs_refinement: false,
    citation_ids: [],
    citation_anchor_ids: [],
    evidence_items: [],
    source_ids: [],
    source_coverage_count: 1,
    editable: true,
    created_by: 'ai',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

test('syncWorkspaceFocusWithGraph keeps node focus in sync with updated graph data', () => {
  const focus: WorkspaceFocus = {
    type: 'node',
    conceptMapId: 'map-1',
    node: {
      ...nodes[0],
      summary: 'Outdated summary',
    },
  };

  const nextFocus = syncWorkspaceFocusWithGraph(focus, conceptMap, nodes, edges);
  assert.equal(nextFocus?.type, 'node');
  if (nextFocus?.type === 'node') {
    assert.equal(nextFocus.node.summary, 'Updated summary');
  }
});

test('syncWorkspaceFocusWithGraph refreshes edge labels and preserves citation focus separately', () => {
  const edgeFocus: WorkspaceFocus = {
    type: 'edge',
    conceptMapId: 'map-1',
    edge: {
      ...edges[0],
      summary: 'Old summary',
    },
    sourceLabel: 'Old Source',
    targetLabel: 'Old Target',
  };

  const syncedEdgeFocus = syncWorkspaceFocusWithGraph(edgeFocus, conceptMap, nodes, edges);
  assert.equal(syncedEdgeFocus?.type, 'edge');
  if (syncedEdgeFocus?.type === 'edge') {
    assert.equal(syncedEdgeFocus.sourceLabel, 'Photosynthesis');
    assert.equal(syncedEdgeFocus.targetLabel, 'ATP');
    assert.equal(syncedEdgeFocus.edge.summary, 'Updated relationship');
  }

  const citationFocus: WorkspaceFocus = {
    type: 'citation',
    citationId: 'citation-1',
    resolution: {
      citation: {
        id: 'citation-1',
        source_title: 'Source 1',
        page_start: 4,
        page_end: 4,
      },
      chunk: {
        content: 'ATP is produced here.',
      },
      citation_anchors: [{ id: 'anchor-1', snippet_text: 'ATP is produced here.' }],
    },
  };

  assert.equal(syncWorkspaceFocusWithGraph(citationFocus, conceptMap, nodes, edges), citationFocus);
  assert.equal(toCanvasSelection(citationFocus), null);
});
