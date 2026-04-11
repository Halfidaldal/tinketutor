'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import type { CanvasSelectionContext } from '../../lib/concept-map';
import CitationBadge from '../citations/CitationBadge';
import { api } from '../../lib/api';

interface SourceSummary {
  id: string;
  title: string;
  status: string;
}

interface EvidenceItem {
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
  support: string;
  keyword_score: number;
  vector_score: number;
}

interface EvidencePack {
  id: string;
  notebook_id: string;
  query: string;
  retrieval_mode: string;
  source_ids: string[];
  top_evidence: EvidenceItem[];
  support_assessment: string;
  answerable_from_notebook: boolean;
  insufficient_grounding: boolean;
  insufficiency_reason?: string | null;
  generated_at?: string | null;
  diagnostics?: Record<string, unknown>;
}

interface RetrievalReadiness {
  notebook_id: string;
  total_source_count: number;
  ready_source_count: number;
  chunk_count: number;
  traceable_chunk_count: number;
  citation_anchor_count: number;
  retrieval_ready: boolean;
  blocking_reasons: string[];
}

interface CitationResolution {
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

const SUPPORT_STYLES: Record<string, { color: string; background: string; label: string }> = {
  strong: {
    color: 'var(--color-success)',
    background: 'var(--color-success-bg)',
    label: 'Strong support',
  },
  partial: {
    color: 'var(--color-warning)',
    background: 'var(--color-warning-bg)',
    label: 'Partial support',
  },
  weak: {
    color: 'var(--color-error)',
    background: 'var(--color-error-bg)',
    label: 'Weak support',
  },
};

const ASSESSMENT_LABELS: Record<string, string> = {
  supported: 'Supported by notebook evidence',
  weak_evidence: 'Evidence is weak',
  insufficient_grounding: 'Insufficient grounding',
  no_ready_sources: 'No ready sources',
  no_matching_evidence: 'No matching evidence',
  missing_traceability: 'Traceability incomplete',
};

export function EvidencePanel({
  notebookId,
  sources,
  selection,
}: {
  notebookId: string;
  sources: SourceSummary[];
  selection: CanvasSelectionContext;
}) {
  const [query, setQuery] = useState('');
  const [readiness, setReadiness] = useState<RetrievalReadiness | null>(null);
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationResolution | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readySourceIds = useMemo(
    () => sources.filter((source) => source.status === 'ready').map((source) => source.id),
    [sources]
  );

  const selectedEvidenceItems = selection?.type === 'node'
    ? selection.node.evidence_items
    : selection?.edge.evidence_items || [];

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      setLoadingReadiness(true);
      try {
        const response = await api.search.getReadiness(notebookId) as RetrievalReadiness;
        if (!cancelled) {
          setReadiness(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load retrieval readiness');
        }
      } finally {
        if (!cancelled) {
          setLoadingReadiness(false);
        }
      }
    }

    loadReadiness().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [notebookId, sources]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSelectedCitation(null);
    try {
      const response = await api.search.query({
        notebookId,
        query: query.trim(),
        sourceIds: readySourceIds,
        topK: 6,
      }) as { evidence_pack: EvidencePack };

      setEvidencePack(response.evidence_pack);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retrieval failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCitationClick(citationId: string) {
    setCitationLoading(true);
    setError(null);
    try {
      const response = await api.search.getCitation(citationId) as CitationResolution;
      setSelectedCitation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load citation');
    } finally {
      setCitationLoading(false);
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Evidence
        </span>
        {evidencePack && (
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
            {evidencePack.retrieval_mode}
          </span>
        )}
      </div>

      <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-primary)' }}>
        {selection && (
          <div
            className="surface"
            style={{
              marginBottom: '0.875rem',
              padding: '0.875rem',
              display: 'grid',
              gap: '0.625rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gap: '0.125rem' }}>
                <span style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                  Canvas Context
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
                  {selection.type === 'node'
                    ? selection.node.label
                    : `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuery(
                  selection.type === 'node'
                    ? selection.node.label
                    : `${selection.sourceLabel} ${selection.edge.label} ${selection.targetLabel}`
                )}
                style={{
                  padding: '0.35rem 0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-secondary)',
                  background: 'transparent',
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                Use as Query
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              {selection.type === 'node'
                ? selection.node.summary || 'Notebook-grounded concept support.'
                : selection.edge.summary || 'Notebook-grounded relationship support.'}
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {selectedEvidenceItems.slice(0, 3).map((item) => {
                const supportStyle = SUPPORT_STYLES[item.support] || SUPPORT_STYLES.weak;
                return (
                  <div
                    key={`${item.chunk_id}-${item.rank}`}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-primary)',
                      background: 'var(--color-bg-surface)',
                      display: 'grid',
                      gap: '0.4rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {item.source_title}
                      </span>
                      <span
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: 'var(--radius-full)',
                          background: supportStyle.background,
                          color: supportStyle.color,
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                        }}
                      >
                        {supportStyle.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                      {item.snippet_text}
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {item.citation_ids.map((citationId) => (
                        <CitationBadge
                          key={citationId}
                          sourceTitle={item.source_title}
                          pageStart={item.page_start}
                          pageEnd={item.page_end}
                          onClick={() => handleCitationClick(citationId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label
            htmlFor="evidence-query"
            style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}
          >
            Notebook Query
          </label>
          <textarea
            id="evidence-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            placeholder="Ask a precise question that should be answered only from this notebook."
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-secondary)',
              background: 'var(--color-bg-surface)',
              color: 'var(--color-text-primary)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
            }}
          />
          <button
            type="submit"
            disabled={submitting || !query.trim()}
            style={{
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              opacity: submitting || !query.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? 'Retrieving evidence...' : 'Retrieve Evidence'}
          </button>
        </form>

        <div style={{ marginTop: '0.875rem', display: 'grid', gap: '0.5rem' }}>
          <div
            className="surface"
            style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
          >
            {loadingReadiness && 'Checking retrieval readiness...'}
            {!loadingReadiness && readiness && (
              <div style={{ display: 'grid', gap: '0.375rem' }}>
                <div>
                  {readiness.ready_source_count}/{readiness.total_source_count} ready sources
                </div>
                <div>
                  {readiness.traceable_chunk_count}/{readiness.chunk_count} traceable chunks
                </div>
                <div>{readiness.citation_anchor_count} citation anchors</div>
              </div>
            )}
          </div>

          {readiness && !readiness.retrieval_ready && (
            <div
              className="surface"
              style={{
                padding: '0.75rem',
                borderColor: 'var(--color-warning)',
                background: 'var(--color-warning-bg)',
                display: 'grid',
                gap: '0.375rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-warning)' }}>
                Retrieval is not fully ready
              </div>
              {readiness.blocking_reasons.map((reason) => (
                <div key={reason} style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  {reason}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
        {error && (
          <div
            className="surface"
            style={{
              padding: '0.875rem',
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              fontSize: '0.75rem',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {!evidencePack && !error && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
            Retrieval results will appear here as evidence cards with source traceability. This panel does not answer on its own; it shows what the notebook can and cannot support.
          </div>
        )}

        {evidencePack && (
          <>
            <div
              className="surface"
              style={{
                padding: '0.875rem',
                display: 'grid',
                gap: '0.5rem',
                borderColor: evidencePack.insufficient_grounding ? 'var(--color-warning)' : 'var(--color-success)',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {ASSESSMENT_LABELS[evidencePack.support_assessment] || evidencePack.support_assessment}
              </div>
              {evidencePack.insufficiency_reason && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  {evidencePack.insufficiency_reason}
                </div>
              )}
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                {evidencePack.top_evidence.length} evidence item{evidencePack.top_evidence.length !== 1 ? 's' : ''} | {evidencePack.retrieval_mode}
              </div>
            </div>

            {evidencePack.top_evidence.map((item) => {
              const supportStyle = SUPPORT_STYLES[item.support] || SUPPORT_STYLES.weak;
              return (
                <div key={item.chunk_id} className="surface" style={{ padding: '0.875rem', display: 'grid', gap: '0.625rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>Rank {item.rank}</div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {item.source_title}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.1875rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        background: supportStyle.background,
                        color: supportStyle.color,
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {supportStyle.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {item.citation_ids.slice(0, 1).map((citationId) => (
                      <CitationBadge
                        key={citationId}
                        sourceTitle={item.source_title}
                        pageStart={item.page_start}
                        pageEnd={item.page_end}
                        onClick={() => handleCitationClick(citationId)}
                      />
                    ))}
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    {item.snippet_text}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                    <span>{item.section_title || 'Section metadata unavailable'}</span>
                    <span>score {item.score.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}

            {(citationLoading || selectedCitation) && (
              <div className="surface" style={{ padding: '0.875rem', display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Stored Citation Detail
                </div>
                {citationLoading && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                    Loading citation...
                  </div>
                )}
                {selectedCitation && !citationLoading && (
                  <>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {selectedCitation.citation.source_title}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                      Pages {selectedCitation.citation.page_start}-{selectedCitation.citation.page_end}
                      {selectedCitation.citation.section_title ? ` | ${selectedCitation.citation.section_title}` : ''}
                    </div>
                    {selectedCitation.citation_anchors[0]?.snippet_text && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        {selectedCitation.citation_anchors[0].snippet_text}
                      </div>
                    )}
                    <div
                      style={{
                        maxHeight: 180,
                        overflow: 'auto',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-bg-surface)',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {selectedCitation.chunk.content}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EvidencePanel;
