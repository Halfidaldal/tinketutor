'use client';

import { useEffect, useState } from 'react';

import type { CanvasSelectionContext } from '../../lib/concept-map';

const SUPPORT_LABELS: Record<string, string> = {
  strong: 'Strong support',
  partial: 'Partial support',
  weak: 'Weak support',
};

const STATUS_LABELS: Record<string, string> = {
  skeleton: 'Skeleton concept',
  student_filled: 'Student filled',
  ai_generated: 'AI generated',
  verified: 'Verified',
};

export default function CanvasInspector({
  selection,
  onClose,
  onSaveNode,
  onSaveEdge,
}: {
  selection: CanvasSelectionContext;
  onClose: () => void;
  onSaveNode: (nodeId: string, updates: {
    label?: string;
    summary?: string;
    note?: string;
  }) => Promise<void>;
  onSaveEdge: (edgeId: string, updates: {
    label?: string;
    summary?: string;
  }) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) {
      setLabel('');
      setSummary('');
      setNote('');
      setSaveError(null);
      return;
    }

    if (selection.type === 'node') {
      setLabel(selection.node.label);
      setSummary(selection.node.summary);
      setNote(selection.node.note);
      return;
    }

    setLabel(selection.edge.label);
    setSummary(selection.edge.summary);
    setNote('');
    setSaveError(null);
  }, [selection]);

  if (!selection) {
    return null;
  }

  const activeSelection = selection;
  const support = activeSelection.type === 'node' ? activeSelection.node.support : activeSelection.edge.support;
  const citationCount = activeSelection.type === 'node'
    ? activeSelection.node.citation_ids.length
    : activeSelection.edge.citation_ids.length;
  const nodeStatus = activeSelection.type === 'node' ? activeSelection.node.status : null;
  const isSkeletonNode = nodeStatus === 'skeleton';

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      if (activeSelection.type === 'node') {
        await onSaveNode(activeSelection.node.id, {
          label,
          summary,
          note,
        });
      } else {
        await onSaveEdge(activeSelection.edge.id, {
          label,
          summary,
        });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

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
          <span style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            {activeSelection.type === 'node' ? 'Concept Inspector' : 'Relationship Inspector'}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {activeSelection.type === 'node'
              ? activeSelection.node.label
              : `${activeSelection.sourceLabel} → ${activeSelection.targetLabel}`}
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
          }}
        >
          Close
        </button>
      </div>

      <div style={{ padding: '1rem', overflow: 'auto', display: 'grid', gap: '0.9rem' }}>
        <div
          className="surface"
          style={{ padding: '0.875rem', display: 'grid', gap: '0.4rem' }}
        >
          {activeSelection.type === 'node' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Completion Status
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: isSkeletonNode ? 'var(--color-warning)' : 'var(--color-success)',
                  }}
                >
                  {STATUS_LABELS[activeSelection.node.status] || activeSelection.node.status}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {isSkeletonNode
                  ? 'This node is intentionally incomplete. Use the inspector to turn a guided placeholder into a student-authored concept.'
                  : 'This node has already been completed or grounded. You can still refine the wording without changing the canvas interaction model.'}
              </div>
              {activeSelection.node.guiding_question && (
                <div
                  style={{
                    padding: '0.7rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-primary)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: 'var(--color-text-primary)' }}>Guiding question:</strong>{' '}
                  {activeSelection.node.guiding_question}
                </div>
              )}
            </>
          )}

          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Support Status
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {SUPPORT_LABELS[support] || support}. {activeSelection.type === 'node'
              ? activeSelection.node.uncertain
                ? 'This concept should be reviewed against the cited evidence.'
                : 'This concept is grounded directly in notebook evidence.'
              : activeSelection.edge.uncertain
                ? 'This relationship is tentative and should be refined if needed.'
                : 'This relationship is directly grounded in notebook evidence.'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
            {citationCount} citation{citationCount === 1 ? '' : 's'} attached
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {activeSelection.type === 'node' ? 'Concept Label' : 'Relationship Label'}
            </span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Summary
            </span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={4}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '0.7rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-secondary)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.78rem',
                lineHeight: 1.55,
              }}
              placeholder={isSkeletonNode ? 'Write the grounded concept in your own words.' : undefined}
            />
          </label>

          {activeSelection.type === 'node' && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Study Note
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={5}
                placeholder="Add a concise notebook-scoped note or reminder."
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '0.7rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-secondary)',
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.78rem',
                  lineHeight: 1.55,
                }}
              />
            </label>
          )}
        </div>

        {saveError && (
          <div
            style={{
              padding: '0.75rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              fontSize: '0.76rem',
              lineHeight: 1.5,
            }}
          >
            {saveError}
          </div>
        )}

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving}
          style={{
            justifySelf: 'start',
            padding: '0.625rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent-primary)',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving
            ? 'Saving…'
            : isSkeletonNode
              ? 'Save Completion'
              : 'Save Refinement'}
        </button>
      </div>
    </aside>
  );
}
