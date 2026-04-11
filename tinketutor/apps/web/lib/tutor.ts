export const TUTOR_MAX_MESSAGES = 20;

export type TutorSuggestedActionId = 'open_sources' | 'open_knowledge_map' | 'open_quiz';

export interface TutorEvidenceItem {
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
}

export interface TutorSuggestedAction {
  id: TutorSuggestedActionId;
  kind: 'navigate';
}

export interface TutorTurn {
  id: string;
  session_id: string;
  notebook_id: string;
  role: 'tutor' | 'student';
  message: string;
  tutor_state: string;
  message_type: string;
  user_intent?: string | null;
  escalation_action?: string | null;
  citations: string[];
  evidence_pack_id?: string | null;
  evidence_items: TutorEvidenceItem[];
  escalation_available: boolean;
  follow_up_required: boolean;
  suggested_next_action?: string | null;
  suggested_actions: TutorSuggestedAction[];
  support_assessment?: string | null;
  insufficient_grounding: boolean;
  insufficiency_reason?: string | null;
  language: string;
  created_at: string;
}

export interface TutorSession {
  id: string;
  notebook_id: string;
  user_id: string;
  focus_area: string;
  source_ids: string[];
  status: string;
  current_mode: 'onboarding' | 'studying' | 'reviewing' | 'remediating';
  current_state: string;
  message_count: number;
  hint_level: number;
  language: string;
  last_user_message?: string | null;
  last_evidence_pack_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorMessageTextPart {
  type: 'text';
  value: string;
  key: string;
}

export interface TutorMessageCitationPart {
  type: 'citation';
  key: string;
  label: string;
  citationId: string;
  evidenceItem: TutorEvidenceItem;
}

export type TutorMessagePart = TutorMessageTextPart | TutorMessageCitationPart;

const CITATION_TOKEN_PATTERN = /\[(\d+)\]/g;

function buildCitationPart(index: number, evidenceItem: TutorEvidenceItem): TutorMessageCitationPart | null {
  const citationId = evidenceItem.citation_ids[0];
  if (!citationId) {
    return null;
  }

  return {
    type: 'citation',
    key: `citation-${index}-${citationId}`,
    label: `[${index + 1}]`,
    citationId,
    evidenceItem,
  };
}

export function buildTutorMessageParts(
  content: string,
  evidenceItems: TutorEvidenceItem[],
): TutorMessagePart[] {
  const parts: TutorMessagePart[] = [];
  let lastIndex = 0;
  let foundExplicitCitation = false;

  for (const match of content.matchAll(CITATION_TOKEN_PATTERN)) {
    const matchedToken = match[0];
    const matchedIndex = match.index ?? 0;
    const evidenceIndex = Number(match[1]) - 1;

    if (matchedIndex > lastIndex) {
      parts.push({
        type: 'text',
        key: `text-${lastIndex}`,
        value: content.slice(lastIndex, matchedIndex),
      });
    }

    const evidenceItem = evidenceItems[evidenceIndex];
    const citationPart = evidenceItem ? buildCitationPart(evidenceIndex, evidenceItem) : null;
    if (citationPart) {
      parts.push(citationPart);
      foundExplicitCitation = true;
    } else {
      parts.push({
        type: 'text',
        key: `text-${matchedIndex}`,
        value: matchedToken,
      });
    }

    lastIndex = matchedIndex + matchedToken.length;
  }

  if (lastIndex < content.length || parts.length === 0) {
    parts.push({
      type: 'text',
      key: `text-${lastIndex}`,
      value: content.slice(lastIndex),
    });
  }

  if (foundExplicitCitation || evidenceItems.length === 0) {
    return parts;
  }

  const synthesizedParts = [...parts];
  for (const [index, evidenceItem] of evidenceItems.entries()) {
    const citationPart = buildCitationPart(index, evidenceItem);
    if (citationPart) {
      synthesizedParts.push(citationPart);
    }
  }
  return synthesizedParts;
}

export function buildTutorActionHref(
  actionId: TutorSuggestedActionId,
  notebookId: string,
  focusArea?: string | null,
): string {
  if (actionId === 'open_sources') {
    return `/workspace/${notebookId}`;
  }

  if (actionId === 'open_knowledge_map') {
    return `/workspace/${notebookId}/canvas`;
  }

  const params = new URLSearchParams();
  if (focusArea?.trim()) {
    params.set('topic', focusArea.trim());
  }
  params.set('autostart', '1');
  return `/workspace/${notebookId}/quiz?${params.toString()}`;
}
