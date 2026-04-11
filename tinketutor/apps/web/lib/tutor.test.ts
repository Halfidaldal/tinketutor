import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTutorActionHref, buildTutorMessageParts, type TutorEvidenceItem } from './tutor';

function createEvidenceItem(index: number): TutorEvidenceItem {
  return {
    source_id: `source-${index}`,
    source_title: `Source ${index}`,
    chunk_id: `chunk-${index}`,
    citation_ids: [`citation-${index}`],
    citation_anchor_ids: [`anchor-${index}`],
    snippet_text: `Snippet ${index}`,
    page_start: index,
    page_end: index,
    rank: index,
    score: 0.9,
    support: 'strong',
  };
}

test('buildTutorMessageParts parses explicit inline citations', () => {
  const parts = buildTutorMessageParts(
    'Read the strongest claim [1] before you answer.',
    [createEvidenceItem(1)],
  );

  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((part) => part.type),
    ['text', 'citation', 'text'],
  );
  assert.equal(parts[1]?.type, 'citation');
  if (parts[1]?.type === 'citation') {
    assert.equal(parts[1].label, '[1]');
    assert.equal(parts[1].citationId, 'citation-1');
  }
});

test('buildTutorMessageParts synthesizes inline citations when markers are absent', () => {
  const parts = buildTutorMessageParts(
    'Use the cited passage to ground your next step.',
    [createEvidenceItem(1), createEvidenceItem(2)],
  );

  assert.deepEqual(
    parts.map((part) => part.type),
    ['text', 'citation', 'citation'],
  );
  assert.equal(parts[1]?.type, 'citation');
  assert.equal(parts[2]?.type, 'citation');
  if (parts[1]?.type === 'citation' && parts[2]?.type === 'citation') {
    assert.equal(parts[1].label, '[1]');
    assert.equal(parts[2].label, '[2]');
  }
});

test('buildTutorActionHref maps suggested action ids to workspace routes', () => {
  assert.equal(buildTutorActionHref('open_sources', 'nb-1', 'Cell Biology'), '/workspace/nb-1');
  assert.equal(buildTutorActionHref('open_knowledge_map', 'nb-1', 'Cell Biology'), '/workspace/nb-1/canvas');
  assert.equal(
    buildTutorActionHref('open_quiz', 'nb-1', 'Cell Biology'),
    '/workspace/nb-1/quiz?topic=Cell+Biology&autostart=1',
  );
});
