from __future__ import annotations

from dataclasses import dataclass
import re

from app.config import settings
from app.domain.enums import (
    CitationOutputType,
    Language,
    SourceStatus,
    SupportAssessment,
    TutorEscalationAction,
    TutorMessageRole,
    TutorMessageType,
    TutorMode,
    TutorSessionStatus,
    TutorState,
    TutorUserIntent,
)
from app.domain.exceptions import NotFoundError, TutorSessionLimitError, ValidationError
from app.domain.models import (
    EvidenceChunk,
    EvidencePack,
    TutorEvidenceReference,
    TutorSession,
    TutorSuggestedAction,
    TutorTurn,
)
from app.infra.store import new_id, utc_now
from app.providers.embedding import EmbeddingProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.repositories import source_ingestion_repository, tutor_repository
from app.services import citation_service, notebook_service, search_service


ENGLISH_DIRECT_ANSWER_PATTERNS = (
    "give me the answer",
    "explain directly",
    "just tell me",
    "tell me the answer",
    "answer directly",
)
ENGLISH_MORE_HELP_PATTERNS = (
    "show more help",
    "more help",
    "another hint",
    "stronger hint",
)
ENGLISH_EVIDENCE_PATTERNS = (
    "show the evidence",
    "show the source",
    "where does it say",
    "point me to the source",
)
ENGLISH_SELF_EXPLANATION_PATTERNS = (
    "i think",
    "my understanding",
    "it means",
    "because",
)

DANISH_DIRECT_ANSWER_PATTERNS = (
    "giv mig svaret",
    "forklar direkte",
    "bare sig svaret",
    "sig svaret",
)
DANISH_MORE_HELP_PATTERNS = (
    "vis mere hjælp",
    "mere hjælp",
    "et hint mere",
    "større hint",
)
DANISH_EVIDENCE_PATTERNS = (
    "vis evidensen",
    "vis kilden",
    "hvor står det",
    "peg på kilden",
)
DANISH_SELF_EXPLANATION_PATTERNS = (
    "jeg tror",
    "min forståelse",
    "det betyder",
    "fordi",
)

ONBOARDING_GREETINGS_DA: dict[str, str] = {
    "empty": (
        "Hej! Jeg er din TinkeTutor. Jeg holder alt, jeg siger, forankret i dine egne "
        "materialer. Upload en PDF, et slide deck eller et dokument, så guider jeg dig "
        "igennem det sammen med dig."
    ),
    "processing": (
        "Hej igen! Jeg er ved at indeksere dine materialer nu. Så snart de er klar, "
        "kan jeg stille dig gode spørgsmål og pege på de præcise steder i kilderne."
    ),
    "partial": (
        "Hej! Nogle af dine materialer er klar, og andre er stadig under behandling. "
        "Vi kan roligt begynde på det, der allerede er indekseret."
    ),
    "ready": (
        "Hej! Dine materialer er klar. Sig til, hvad du vil forstå, eller vælg et "
        "oplæg herunder, så starter vi der."
    ),
}

ONBOARDING_GREETINGS_EN: dict[str, str] = {
    "empty": (
        "Hi! I'm your TinkeTutor. I keep every answer grounded in your own study "
        "materials. Upload a PDF, slide deck, or document and I'll walk through it "
        "with you."
    ),
    "processing": (
        "Welcome back. I'm indexing your materials right now. As soon as they're "
        "ready I'll be able to ask the right questions and point at the exact "
        "passages."
    ),
    "partial": (
        "Hi! Some of your materials are ready while others are still processing. "
        "We can safely begin with the parts that are already indexed."
    ),
    "ready": (
        "Hi! Your materials are ready. Tell me what you want to understand, or pick "
        "one of the prompts below and we'll start there."
    ),
}

ONBOARDING_NEXT_ACTIONS_DA: dict[str, str] = {
    "empty": "Upload dit første studiemateriale, så kan vi starte.",
    "processing": "Jeg siger til, så snart dine materialer er klar.",
    "partial": "Vælg et klart materiale, eller spørg mig om det, der allerede er indekseret.",
    "ready": "Fortæl, hvad du vil forstå — eller bed mig om at opsummere et af materialerne.",
}

ONBOARDING_NEXT_ACTIONS_EN: dict[str, str] = {
    "empty": "Upload your first study material so we can begin.",
    "processing": "I'll let you know the moment your materials finish indexing.",
    "partial": "Pick a ready material, or ask me about what's already indexed.",
    "ready": "Tell me what you want to understand — or ask me to summarize one of the materials.",
}

DANISH_MARKERS = {"hvad", "hvordan", "hvorfor", "hvilken", "jeg", "ikke", "med", "og", "det", "der"}
FOLLOW_UP_REFERENCE_TOKENS = {
    "den",
    "det",
    "de",
    "dem",
    "dette",
    "han",
    "he",
    "her",
    "him",
    "his",
    "hun",
    "it",
    "its",
    "she",
    "that",
    "this",
    "them",
    "they",
    "those",
    "who",
    "why",
}
GENERIC_FOLLOW_UP_QUERIES = {
    "how so",
    "hvad så",
    "hvem er det",
    "hvem er han",
    "hvem er hun",
    "who is he",
    "who is she",
    "why",
    "why is that",
}


@dataclass
class TutorTurnDraft:
    current_mode: TutorMode
    tutor_state: TutorState
    message_type: TutorMessageType
    content: str
    user_intent: TutorUserIntent | None
    evidence_items: list[EvidenceChunk]
    escalation_available: bool
    follow_up_required: bool
    suggested_next_action: str | None
    suggested_actions: list[TutorSuggestedAction]
    support_assessment: SupportAssessment | None
    insufficient_grounding: bool
    insufficiency_reason: str | None
    language: Language
    next_hint_level: int


def _normalize_text(value: str) -> str:
    return value.casefold().strip()


def _tokenize(value: str) -> list[str]:
    return re.findall(r"\w+", _normalize_text(value), flags=re.UNICODE)


def _detect_language(value: str) -> Language:
    lowered = _normalize_text(value)
    if any(char in lowered for char in ("æ", "ø", "å")):
        return Language.DA
    tokens = set(_tokenize(lowered))
    if tokens & DANISH_MARKERS:
        return Language.DA
    return Language.EN


def _configured_default_language() -> Language:
    default_locale = settings.default_locale.strip().lower()
    if default_locale == Language.DA.value:
        return Language.DA
    return Language.EN


def _resolve_language(
    locale: str | None,
    *,
    query: str | None = None,
    current_language: Language | None = None,
    response_locale: str | None = None,
) -> Language:
    """Resolve the output language for a tutor exchange.

    Precedence: explicit response_locale → legacy locale → existing session language
    → language detected from the user message → configured default.
    """
    supported_locales = set(settings.supported_locales)

    for candidate in (response_locale, locale):
        normalized = (candidate or "").strip().lower()
        if normalized and normalized in supported_locales:
            return Language(normalized)

    if current_language and current_language != Language.UNKNOWN:
        return current_language
    if query:
        detected_language = _detect_language(query)
        if detected_language != Language.UNKNOWN:
            return detected_language
    return _configured_default_language()


def _page_label(language: Language, page_start: int, page_end: int) -> str:
    if page_start == page_end:
        return f"s. {page_start}" if language == Language.DA else f"p. {page_start}"
    return (
        f"s. {page_start}-{page_end}"
        if language == Language.DA
        else f"pp. {page_start}-{page_end}"
    )


def _trim_snippet(snippet: str, *, limit: int = 180) -> str:
    snippet = " ".join(snippet.split())
    if len(snippet) <= limit:
        return snippet
    return snippet[: limit - 1].rstrip() + "…"


def _source_locator(language: Language, item: EvidenceChunk) -> str:
    locator = _page_label(language, item.page_start, item.page_end)
    if item.section_title:
        return f"{item.source_title}, {locator}, {item.section_title}"
    return f"{item.source_title}, {locator}"


def _needs_goal_clarification(query: str) -> bool:
    tokens = [token for token in _tokenize(query) if len(token) > 2]
    generic_queries = {"help", "hjælp", "explain", "forklar", "understand", "forstå"}
    return len(tokens) <= 1 or _normalize_text(query) in generic_queries


def _looks_broad(query: str) -> bool:
    tokens = [token for token in _tokenize(query) if len(token) > 2]
    return len(tokens) <= 3


def _infer_user_intent(
    content: str,
    *,
    escalation_action: TutorEscalationAction | None,
) -> TutorUserIntent:
    if escalation_action in {
        TutorEscalationAction.GIVE_ME_THE_ANSWER,
        TutorEscalationAction.EXPLAIN_DIRECTLY,
    }:
        return TutorUserIntent.REQUEST_DIRECT_ANSWER
    if escalation_action == TutorEscalationAction.SHOW_MORE_HELP:
        return TutorUserIntent.REQUEST_MORE_HELP

    lowered = _normalize_text(content)

    if any(pattern in lowered for pattern in ENGLISH_DIRECT_ANSWER_PATTERNS + DANISH_DIRECT_ANSWER_PATTERNS):
        return TutorUserIntent.REQUEST_DIRECT_ANSWER
    if any(pattern in lowered for pattern in ENGLISH_MORE_HELP_PATTERNS + DANISH_MORE_HELP_PATTERNS):
        return TutorUserIntent.REQUEST_MORE_HELP
    if any(pattern in lowered for pattern in ENGLISH_EVIDENCE_PATTERNS + DANISH_EVIDENCE_PATTERNS):
        return TutorUserIntent.REQUEST_EVIDENCE
    if any(pattern in lowered for pattern in ENGLISH_SELF_EXPLANATION_PATTERNS + DANISH_SELF_EXPLANATION_PATTERNS):
        return TutorUserIntent.SELF_EXPLANATION
    if _needs_goal_clarification(content):
        return TutorUserIntent.CLARIFY_REQUEST
    return TutorUserIntent.UNDERSTAND_TOPIC


def _default_next_action(language: Language) -> str:
    if language == Language.DA:
        return "Svar med din egen formulering, eller vælg en tydelig eskalering for mere hjælp."
    return "Reply with your own explanation, or choose an explicit escalation for stronger help."


def _needs_contextual_retrieval(query: str) -> bool:
    normalized = _normalize_text(query).rstrip("?.!")
    tokens = _tokenize(normalized)
    if not tokens:
        return False
    meaningful_tokens = [token for token in tokens if len(token) > 2]
    reference_tokens = [token for token in tokens if token in FOLLOW_UP_REFERENCE_TOKENS]

    if normalized in GENERIC_FOLLOW_UP_QUERIES:
        return True
    if len(meaningful_tokens) <= 2 and reference_tokens:
        return True
    return len(meaningful_tokens) <= 1 and len(tokens) <= 5


def _build_retrieval_query(*, session: TutorSession, query: str, is_new_session: bool) -> str:
    if is_new_session or not _needs_contextual_retrieval(query):
        return query

    context_parts: list[str] = []
    if session.focus_area and _normalize_text(session.focus_area) != _normalize_text(query):
        context_parts.append(f"Focus topic: {session.focus_area}")
    if session.last_user_message and _normalize_text(session.last_user_message) != _normalize_text(query):
        context_parts.append(f"Previous question: {session.last_user_message}")

    if not context_parts:
        return query

    context_parts.append(f"Follow-up question: {query}")
    return "\n".join(context_parts)


def _suggested_action(action_id: str) -> TutorSuggestedAction:
    return TutorSuggestedAction(id=action_id, kind="navigate")


def _compute_source_availability_state(sources: list) -> str:
    """Classify the learner's source library for onboarding.

    Returns one of: "empty", "processing", "partial", "ready".
    """
    if not sources:
        return "empty"
    ready = [s for s in sources if s.status == SourceStatus.READY]
    pending = [s for s in sources if s.status in {SourceStatus.UPLOADED, SourceStatus.PROCESSING}]
    if ready and not pending:
        return "ready"
    if ready and pending:
        return "partial"
    if pending:
        return "processing"
    # All failed or otherwise not ready — treat as empty so the tutor steers to upload.
    return "empty"


def _build_onboarding_content(
    *,
    language: Language,
    state: str,
    ready_source_titles: list[str],
) -> str:
    templates = ONBOARDING_GREETINGS_DA if language == Language.DA else ONBOARDING_GREETINGS_EN
    base = templates.get(state, templates["empty"])
    if state == "partial" and ready_source_titles:
        preview = ", ".join(ready_source_titles[:3])
        if language == Language.DA:
            base = f"{base} De klare materialer lige nu: {preview}."
        else:
            base = f"{base} Ready right now: {preview}."
    if state == "ready" and ready_source_titles:
        first = ready_source_titles[0]
        if language == Language.DA:
            base = f"{base} Jeg kan fx starte med at opsummere hovedideerne i \"{first}\"."
        else:
            base = f"{base} For example, I can start by summarizing the main ideas of \"{first}\"."
    return base


def _build_onboarding_suggested_actions(state: str) -> list[TutorSuggestedAction]:
    if state == "empty":
        return [_suggested_action("upload_sources")]
    if state == "processing":
        return [_suggested_action("open_sources")]
    if state == "partial":
        return [_suggested_action("open_sources"), _suggested_action("open_knowledge_map")]
    # ready
    return [
        _suggested_action("open_knowledge_map"),
        _suggested_action("open_quiz"),
    ]


def _build_onboarding_turn_draft(
    *,
    language: Language,
    sources: list,
) -> TutorTurnDraft:
    state = _compute_source_availability_state(sources)
    ready_source_titles = [
        s.title for s in sources if s.status == SourceStatus.READY and s.title
    ]
    content = _build_onboarding_content(
        language=language,
        state=state,
        ready_source_titles=ready_source_titles,
    )
    suggested_actions = _build_onboarding_suggested_actions(state)
    next_action_lookup = (
        ONBOARDING_NEXT_ACTIONS_DA if language == Language.DA else ONBOARDING_NEXT_ACTIONS_EN
    )
    suggested_next_action = next_action_lookup.get(state)

    if state in {"empty", "processing"}:
        support_assessment = SupportAssessment.NO_READY_SOURCES
    else:
        support_assessment = None

    return TutorTurnDraft(
        current_mode=TutorMode.ONBOARDING,
        tutor_state=TutorState.CLARIFY_GOAL,
        message_type=TutorMessageType.QUESTION,
        content=content,
        user_intent=TutorUserIntent.CLARIFY_REQUEST,
        evidence_items=[],  # grounding guard: never synthesize evidence for onboarding
        escalation_available=False,
        follow_up_required=True,
        suggested_next_action=suggested_next_action,
        suggested_actions=suggested_actions,
        support_assessment=support_assessment,
        insufficient_grounding=False,
        insufficiency_reason=None,
        language=language,
        next_hint_level=0,
    )


def _determine_tutor_mode(
    *,
    evidence_pack: EvidencePack,
    is_new_session: bool,
) -> TutorMode:
    if evidence_pack.insufficient_grounding or evidence_pack.support_assessment == SupportAssessment.NO_READY_SOURCES:
        return TutorMode.ONBOARDING
    if is_new_session:
        return TutorMode.ONBOARDING
    return TutorMode.STUDYING


def _build_suggested_actions(
    *,
    current_mode: TutorMode,
    evidence_pack: EvidencePack,
) -> list[TutorSuggestedAction]:
    if current_mode == TutorMode.ONBOARDING:
        return [_suggested_action("open_sources")]

    actions = [_suggested_action("open_knowledge_map")]
    if evidence_pack.chunks:
        actions.append(_suggested_action("open_quiz"))
    return actions


def _build_clarify_goal_text(language: Language) -> str:
    if language == Language.DA:
        return "Hvad vil du præcist forstå her: en definition, en proces eller sammenhængen mellem to ideer?"
    return "What exactly are you trying to understand here: a definition, a process, or the relation between two ideas?"


def _build_retrieval_prompt_text(language: Language, item: EvidenceChunk) -> str:
    locator = _source_locator(language, item)
    if language == Language.DA:
        return (
            f"Før vi løser det, så forankr spørgsmålet i notesbogen. Start med {locator}. "
            f"Hvilken del af afsnittet virker mest relevant for dit spørgsmål?"
        )
    return (
        f"Before we solve it, anchor the question in the notebook. Start with {locator}. "
        f"Which part of that passage seems most relevant to your question?"
    )


def _build_hint_level_1_text(language: Language, item: EvidenceChunk) -> str:
    locator = _source_locator(language, item)
    if language == Language.DA:
        return (
            f"Start med den stærkeste passage i {locator}. "
            f"Hvilken hovedpåstand eller proces bliver navngivet der?"
        )
    return (
        f"Start with the strongest passage in {locator}. "
        f"What main claim or process is named there?"
    )


def _build_hint_level_2_text(language: Language, item: EvidenceChunk) -> str:
    locator = _source_locator(language, item)
    snippet = _trim_snippet(item.snippet_text)
    if language == Language.DA:
        return (
            f"Brug dette spor fra {locator}: \"{snippet}\" "
            f"Hvilken pointe skulle du nævne først, hvis du kun havde én sætning?"
        )
    return (
        f"Use this clue from {locator}: \"{snippet}\" "
        f"What point would you state first if you only had one sentence?"
    )


def _build_evidence_pointing_text(language: Language, item: EvidenceChunk) -> str:
    locator = _source_locator(language, item)
    snippet = _trim_snippet(item.snippet_text)
    if language == Language.DA:
        return (
            f"Se direkte på {locator}: \"{snippet}\" "
            f"Hvilke ord i passagen besvarer dit spørgsmål mest direkte?"
        )
    return (
        f"Look directly at {locator}: \"{snippet}\" "
        f"Which words in that passage answer your question most directly?"
    )


def _build_self_explanation_text(language: Language, item: EvidenceChunk) -> str:
    locator = _source_locator(language, item)
    if language == Language.DA:
        return (
            f"Prøv nu en forklaring på to sætninger med støtte i {locator}. "
            f"Hvad ville din første sætning være?"
        )
    return (
        f"Now try a two-sentence explanation supported by {locator}. "
        f"What would your first sentence be?"
    )


def _build_direct_answer_text(language: Language, query: str, evidence_items: list[EvidenceChunk]) -> str:
    snippets = [_trim_snippet(item.snippet_text, limit=220) for item in evidence_items[:2] if item.snippet_text.strip()]
    if not snippets:
        if language == Language.DA:
            return "Jeg kan kun give et direkte svar, når notesbogen indeholder tydelig evidens."
        return "I can only give a direct answer when the notebook contains clear evidence."

    if language == Language.DA:
        return f"Direkte, men stadig kildebaseret: {' '.join(snippets)}"
    return f"Direct, but still source-grounded: {' '.join(snippets)}"


def _localize_insufficiency_reason(language: Language, reason: str | None) -> str:
    if language != Language.DA:
        return reason or "The notebook does not contain enough traceable evidence for this query."

    normalized = _normalize_text(reason or "")
    if "no ready sources" in normalized:
        return "Der er endnu ingen klargjorte kilder i notesbogen."
    if "no persisted chunks" in normalized:
        return "Kilderne er klar, men der findes endnu ingen søgbare tekstuddrag."
    if "citation anchors are missing" in normalized or "citation anchors are incomplete" in normalized:
        return "Der blev fundet relevante tekstuddrag, men citatsporingen mangler stadig."
    if "no sufficiently relevant notebook evidence was found" in normalized:
        return "Der blev ikke fundet tilstrækkeligt relevant notebook-evidens til dette spørgsmål."
    if "only weak evidence was found" in normalized:
        return "Der blev kun fundet svag evidens til dette spørgsmål. Gennemgå de citerede passager, før du stoler på svaret."
    return reason or "Notesbogen indeholder ikke nok sporbar evidens til dette spørgsmål."


def _build_insufficient_grounding_text(language: Language, evidence_pack: EvidencePack) -> str:
    reason = _localize_insufficiency_reason(language, evidence_pack.insufficiency_reason)
    if language == Language.DA:
        return f"Jeg kan ikke give en ansvarlig, kildebaseret tutorrespons endnu. {reason}"
    return f"I cannot give a responsible, source-grounded tutoring response yet. {reason}"


def _select_evidence_items(
    evidence_pack: EvidencePack,
    *,
    tutor_state: TutorState,
) -> list[EvidenceChunk]:
    if tutor_state in {TutorState.CLARIFY_GOAL, TutorState.INSUFFICIENT_GROUNDING}:
        return []
    if tutor_state == TutorState.DIRECT_ANSWER_ESCALATED:
        return evidence_pack.chunks[:2]
    return evidence_pack.chunks[:1]


def _snapshot_evidence_items(
    *,
    notebook_id: str,
    turn_id: str,
    evidence_items: list[EvidenceChunk],
) -> tuple[list[TutorEvidenceReference], list[str]]:
    references: list[TutorEvidenceReference] = []
    citation_ids: list[str] = []

    for item in evidence_items:
        citation = citation_service.create_output_citation_from_evidence(
            notebook_id=notebook_id,
            output_type=CitationOutputType.TUTOR_MESSAGE,
            output_id=turn_id,
            evidence_item=item,
        )
        reference = TutorEvidenceReference(
            source_id=item.source_id,
            source_title=item.source_title,
            chunk_id=item.chunk_id,
            citation_ids=[citation.id],
            citation_anchor_ids=item.citation_anchor_ids,
            snippet_text=item.snippet_text,
            page_start=item.page_start,
            page_end=item.page_end,
            section_title=item.section_title,
            rank=item.rank,
            score=item.score,
            support=item.support,
        )
        references.append(reference)
        citation_ids.append(citation.id)

    return references, citation_ids


def _determine_tutor_state(
    *,
    session: TutorSession,
    query: str,
    user_intent: TutorUserIntent,
    evidence_pack: EvidencePack,
    is_new_session: bool,
) -> TutorState:
    if evidence_pack.insufficient_grounding:
        return TutorState.INSUFFICIENT_GROUNDING

    if user_intent == TutorUserIntent.REQUEST_DIRECT_ANSWER:
        return TutorState.DIRECT_ANSWER_ESCALATED

    if is_new_session:
        if _needs_goal_clarification(query):
            return TutorState.CLARIFY_GOAL
        if _looks_broad(query):
            return TutorState.RETRIEVAL_PROMPT
        return TutorState.HINT_LEVEL_1

    if user_intent == TutorUserIntent.REQUEST_MORE_HELP:
        if session.hint_level <= 0:
            return TutorState.HINT_LEVEL_1
        if session.hint_level == 1:
            return TutorState.HINT_LEVEL_2
        return TutorState.EVIDENCE_POINTING

    if user_intent == TutorUserIntent.REQUEST_EVIDENCE:
        return TutorState.EVIDENCE_POINTING

    if user_intent == TutorUserIntent.SELF_EXPLANATION:
        return TutorState.SELF_EXPLANATION

    if session.current_state in {TutorState.HINT_LEVEL_2, TutorState.EVIDENCE_POINTING}:
        return TutorState.SELF_EXPLANATION

    if session.current_state in {TutorState.CLARIFY_GOAL, TutorState.RETRIEVAL_PROMPT, TutorState.IDLE}:
        return TutorState.HINT_LEVEL_1

    if session.current_state == TutorState.HINT_LEVEL_1:
        return TutorState.EVIDENCE_POINTING

    return TutorState.HINT_LEVEL_1


def _next_hint_level(session: TutorSession, tutor_state: TutorState) -> int:
    if tutor_state == TutorState.HINT_LEVEL_1:
        return max(session.hint_level, 1)
    if tutor_state == TutorState.HINT_LEVEL_2:
        return max(session.hint_level, 2)
    if tutor_state == TutorState.EVIDENCE_POINTING:
        return max(session.hint_level, 2)
    return session.hint_level


def _build_tutor_turn_draft(
    *,
    session: TutorSession,
    query: str,
    user_intent: TutorUserIntent,
    evidence_pack: EvidencePack,
    language: Language,
    is_new_session: bool,
) -> TutorTurnDraft:
    tutor_state = _determine_tutor_state(
        session=session,
        query=query,
        user_intent=user_intent,
        evidence_pack=evidence_pack,
        is_new_session=is_new_session,
    )
    current_mode = _determine_tutor_mode(
        evidence_pack=evidence_pack,
        is_new_session=is_new_session,
    )
    evidence_items = _select_evidence_items(evidence_pack, tutor_state=tutor_state)
    suggested_actions = _build_suggested_actions(
        current_mode=current_mode,
        evidence_pack=evidence_pack,
    )

    if tutor_state == TutorState.INSUFFICIENT_GROUNDING:
        return TutorTurnDraft(
            current_mode=current_mode,
            tutor_state=tutor_state,
            message_type=TutorMessageType.REDIRECT,
            content=_build_insufficient_grounding_text(language, evidence_pack),
            user_intent=user_intent,
            evidence_items=[],
            escalation_available=False,
            follow_up_required=False,
            suggested_next_action=(
                "Afgræns spørgsmålet eller upload mere materiale om emnet."
                if language == Language.DA
                else "Narrow the question or upload source material that covers this topic."
            ),
            suggested_actions=suggested_actions,
            support_assessment=evidence_pack.support_assessment,
            insufficient_grounding=True,
            insufficiency_reason=evidence_pack.insufficiency_reason,
            language=language,
            next_hint_level=session.hint_level,
        )

    if tutor_state == TutorState.CLARIFY_GOAL:
        return TutorTurnDraft(
            current_mode=current_mode,
            tutor_state=tutor_state,
            message_type=TutorMessageType.QUESTION,
            content=_build_clarify_goal_text(language),
            user_intent=user_intent,
            evidence_items=[],
            escalation_available=False,
            follow_up_required=True,
            suggested_next_action=(
                "Skriv, om du vil have en definition, en procesforklaring eller en sammenligning."
                if language == Language.DA
                else "Reply with whether you need a definition, a process, or a comparison."
            ),
            suggested_actions=suggested_actions,
            support_assessment=evidence_pack.support_assessment,
            insufficient_grounding=False,
            insufficiency_reason=None,
            language=language,
            next_hint_level=session.hint_level,
        )

    item = evidence_items[0]
    if tutor_state == TutorState.RETRIEVAL_PROMPT:
        content = _build_retrieval_prompt_text(language, item)
        message_type = TutorMessageType.QUESTION
        suggested_next_action = (
            "Vælg den del af passagen, du vil starte med."
            if language == Language.DA
            else "Choose the part of the passage you want to start from."
        )
    elif tutor_state == TutorState.HINT_LEVEL_1:
        content = _build_hint_level_1_text(language, item)
        message_type = TutorMessageType.QUESTION
        suggested_next_action = (
            "Svar med den centrale påstand eller proces, du ser i passagen."
            if language == Language.DA
            else "Reply with the central claim or process you see in the passage."
        )
    elif tutor_state == TutorState.HINT_LEVEL_2:
        content = _build_hint_level_2_text(language, item)
        message_type = TutorMessageType.HINT
        suggested_next_action = (
            "Skriv en enkelt sætning, før du beder om mere hjælp."
            if language == Language.DA
            else "Write one sentence before asking for more help."
        )
    elif tutor_state == TutorState.EVIDENCE_POINTING:
        content = _build_evidence_pointing_text(language, item)
        message_type = TutorMessageType.HINT
        suggested_next_action = (
            "Peg på de ord i passagen, du vil bygge svaret på."
            if language == Language.DA
            else "Point to the words in the passage you want to build from."
        )
    elif tutor_state == TutorState.SELF_EXPLANATION:
        content = _build_self_explanation_text(language, item)
        message_type = TutorMessageType.CHALLENGE
        suggested_next_action = (
            "Prøv en kort forklaring med dine egne ord."
            if language == Language.DA
            else "Try a short explanation in your own words."
        )
    else:
        content = _build_direct_answer_text(language, query, evidence_items)
        message_type = TutorMessageType.DIRECT_ANSWER
        suggested_next_action = (
            "Brug citaterne til at kontrollere hvert led i forklaringen."
            if language == Language.DA
            else "Use the citations to verify each part of the explanation."
        )

    return TutorTurnDraft(
        current_mode=current_mode,
        tutor_state=tutor_state,
        message_type=message_type,
        content=content,
        user_intent=user_intent,
        evidence_items=evidence_items,
        escalation_available=tutor_state != TutorState.DIRECT_ANSWER_ESCALATED,
        follow_up_required=tutor_state != TutorState.DIRECT_ANSWER_ESCALATED,
        suggested_next_action=suggested_next_action or _default_next_action(language),
        suggested_actions=suggested_actions,
        support_assessment=evidence_pack.support_assessment,
        insufficient_grounding=False,
        insufficiency_reason=None,
        language=language,
        next_hint_level=_next_hint_level(session, tutor_state),
    )


class TutorService:
    async def start_session(
        self,
        *,
        notebook_id: str,
        user_id: str,
        query: str,
        source_ids: list[str],
        locale: str | None,
        ui_locale: str | None = None,
        response_locale: str | None = None,
        intent: str | None = None,
        vector_store: VectorStore,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
    ) -> tuple[TutorSession, TutorTurn]:
        cleaned_query = query.strip()
        onboarding_intent = (intent or "").strip().lower() == "onboarding"
        is_onboarding_start = onboarding_intent or not cleaned_query

        if not is_onboarding_start and not cleaned_query:
            raise ValidationError("Tutor query is required")

        notebook = notebook_service.get_notebook(notebook_id, user_id)
        if not notebook:
            raise NotFoundError("Notebook", notebook_id)
        invalid_source_ids = [source_id for source_id in source_ids if source_id not in notebook.get("source_ids", [])]
        if invalid_source_ids:
            raise ValidationError(f"Source IDs are outside this notebook: {', '.join(invalid_source_ids)}")

        language = _resolve_language(
            locale,
            query=cleaned_query or None,
            response_locale=response_locale,
        )
        now = utc_now()
        session = TutorSession(
            id=new_id(),
            notebook_id=notebook_id,
            user_id=user_id,
            focus_area=cleaned_query,
            source_ids=source_ids,
            status=TutorSessionStatus.ACTIVE,
            current_mode=TutorMode.ONBOARDING,
            current_state=TutorState.IDLE,
            message_count=0,
            hint_level=0,
            language=language,
            last_user_message=cleaned_query or None,
            created_at=now,
            updated_at=now,
        )
        tutor_repository.create_session(session)

        if is_onboarding_start:
            return await self._record_onboarding_turn(
                session=session,
                language=language,
            )

        return await self._record_exchange(
            session=session,
            content=cleaned_query,
            language=language,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
            escalation_action=None,
            is_new_session=True,
        )

    async def bootstrap_session(
        self,
        *,
        notebook_id: str,
        user_id: str,
        locale: str | None,
        ui_locale: str | None = None,
        response_locale: str | None = None,
        vector_store: VectorStore,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
    ) -> tuple[TutorSession, TutorTurn]:
        """Return the learner's active onboarding session, creating one if needed.

        The Study Home shell (and the workspace TutorPanel on first mount) calls
        this instead of start_session so refreshing the page doesn't pile up
        duplicate onboarding turns.
        """
        notebook = notebook_service.get_notebook(notebook_id, user_id)
        if not notebook:
            raise NotFoundError("Notebook", notebook_id)

        existing_sessions = tutor_repository.list_sessions_for_notebook(
            notebook_id,
            user_id,
            limit=1,
            status=TutorSessionStatus.ACTIVE,
        )
        if existing_sessions:
            session = existing_sessions[0]
            turns = tutor_repository.list_turns_for_session(session.id, limit=1)
            if turns:
                return session, turns[-1]
            # Session exists but has no turns — emit the onboarding turn now.
            language = _resolve_language(
                locale,
                response_locale=response_locale,
                current_language=session.language,
            )
            return await self._record_onboarding_turn(session=session, language=language)

        return await self.start_session(
            notebook_id=notebook_id,
            user_id=user_id,
            query="",
            source_ids=[],
            locale=locale,
            ui_locale=ui_locale,
            response_locale=response_locale,
            intent="onboarding",
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )

    async def continue_session(
        self,
        *,
        notebook_id: str,
        session_id: str,
        user_id: str,
        content: str,
        locale: str | None,
        response_locale: str | None = None,
        vector_store: VectorStore,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
    ) -> tuple[TutorSession, TutorTurn]:
        session = self.get_session(notebook_id=notebook_id, session_id=session_id, user_id=user_id)
        if session.status != TutorSessionStatus.ACTIVE:
            raise ValidationError("Tutor session is no longer active")
        language = _resolve_language(
            locale,
            query=content,
            current_language=session.language,
            response_locale=response_locale,
        )
        return await self._record_exchange(
            session=session,
            content=content,
            language=language,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
            escalation_action=None,
            is_new_session=False,
        )

    async def escalate_session(
        self,
        *,
        notebook_id: str,
        session_id: str,
        user_id: str,
        action: TutorEscalationAction,
        content: str | None,
        locale: str | None,
        response_locale: str | None = None,
        vector_store: VectorStore,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
    ) -> tuple[TutorSession, TutorTurn]:
        session = self.get_session(notebook_id=notebook_id, session_id=session_id, user_id=user_id)
        if session.status != TutorSessionStatus.ACTIVE:
            raise ValidationError("Tutor session is no longer active")
        escalated_content = (content or session.last_user_message or session.focus_area).strip()
        if not escalated_content:
            raise ValidationError("A tutor session needs a question to escalate")
        language = _resolve_language(
            locale,
            query=escalated_content,
            current_language=session.language,
            response_locale=response_locale,
        )

        return await self._record_exchange(
            session=session,
            content=escalated_content,
            language=language,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
            escalation_action=action,
            is_new_session=False,
        )

    def list_sessions(
        self,
        *,
        notebook_id: str,
        user_id: str,
        limit: int = 5,
        status: TutorSessionStatus | None = None,
    ) -> list[TutorSession]:
        return tutor_repository.list_sessions_for_notebook(
            notebook_id,
            user_id,
            limit=limit,
            status=status,
        )

    def get_session(self, *, notebook_id: str, session_id: str, user_id: str) -> TutorSession:
        session = tutor_repository.get_session(session_id)
        if session is None or session.notebook_id != notebook_id or session.user_id != user_id:
            raise NotFoundError("TutorSession", session_id)
        return session

    def list_turns(self, *, notebook_id: str, session_id: str, user_id: str, limit: int | None = None) -> list[TutorTurn]:
        self.get_session(notebook_id=notebook_id, session_id=session_id, user_id=user_id)
        return tutor_repository.list_turns_for_session(session_id, limit=limit)

    async def _record_onboarding_turn(
        self,
        *,
        session: TutorSession,
        language: Language,
    ) -> tuple[TutorSession, TutorTurn]:
        """Persist a proactive, source-aware onboarding turn.

        Unlike `_record_exchange`, this path skips retrieval and the IDLE→hint
        ladder. It exists so the Study Home shell can deliver a grounded
        greeting the moment a learner lands, without falling back to generic
        LLM chat when no sources are available.
        """
        sources = source_ingestion_repository.list_sources(session.notebook_id, session.user_id)
        draft = _build_onboarding_turn_draft(language=language, sources=sources)

        tutor_turn = TutorTurn(
            id=new_id(),
            session_id=session.id,
            notebook_id=session.notebook_id,
            role=TutorMessageRole.TUTOR,
            content=draft.content,
            tutor_state=draft.tutor_state,
            message_type=draft.message_type,
            user_intent=draft.user_intent,
            escalation_action=None,
            citation_ids=[],
            evidence_pack_id=None,
            evidence_items=[],
            escalation_available=draft.escalation_available,
            follow_up_required=draft.follow_up_required,
            suggested_next_action=draft.suggested_next_action,
            suggested_actions=draft.suggested_actions,
            support_assessment=draft.support_assessment,
            insufficient_grounding=False,
            insufficiency_reason=None,
            language=draft.language,
            created_at=utc_now(),
        )
        tutor_repository.create_turn(tutor_turn)

        session.current_mode = draft.current_mode
        session.current_state = draft.tutor_state
        session.hint_level = draft.next_hint_level
        session.language = draft.language
        session.updated_at = utc_now()
        tutor_repository.update_session(session)

        return session, tutor_turn

    async def _record_exchange(
        self,
        *,
        session: TutorSession,
        content: str,
        language: Language,
        vector_store: VectorStore,
        embedding_provider: EmbeddingProvider,
        reranker: Reranker,
        escalation_action: TutorEscalationAction | None,
        is_new_session: bool,
    ) -> tuple[TutorSession, TutorTurn]:
        cleaned_content = content.strip()
        if not cleaned_content:
            raise ValidationError("Tutor message is required")

        if session.message_count >= settings.tutor_max_messages:
            session.status = TutorSessionStatus.COMPLETED
            session.updated_at = utc_now()
            tutor_repository.update_session(session)
            raise TutorSessionLimitError(settings.tutor_max_messages)

        user_intent = _infer_user_intent(cleaned_content, escalation_action=escalation_action)

        student_turn = TutorTurn(
            id=new_id(),
            session_id=session.id,
            notebook_id=session.notebook_id,
            role=TutorMessageRole.STUDENT,
            content=cleaned_content,
            tutor_state=session.current_state,
            message_type=TutorMessageType.STUDENT_RESPONSE,
            user_intent=user_intent,
            escalation_action=escalation_action,
            citation_ids=[],
            evidence_pack_id=None,
            evidence_items=[],
            escalation_available=False,
            follow_up_required=False,
            suggested_next_action=None,
            suggested_actions=[],
            support_assessment=None,
            insufficient_grounding=False,
            insufficiency_reason=None,
            language=language,
            created_at=utc_now(),
        )
        tutor_repository.create_turn(student_turn)

        retrieval_query = _build_retrieval_query(
            session=session,
            query=cleaned_content,
            is_new_session=is_new_session,
        )
        evidence_pack = await search_service.build_evidence_pack(
            notebook_id=session.notebook_id,
            user_id=session.user_id,
            query=retrieval_query,
            requested_source_ids=session.source_ids,
            top_k=4,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
        evidence_pack.diagnostics["retrieval_query"] = retrieval_query

        draft = _build_tutor_turn_draft(
            session=session,
            query=cleaned_content,
            user_intent=user_intent,
            evidence_pack=evidence_pack,
            language=language,
            is_new_session=is_new_session,
        )

        tutor_turn_id = new_id()
        evidence_references, citation_ids = _snapshot_evidence_items(
            notebook_id=session.notebook_id,
            turn_id=tutor_turn_id,
            evidence_items=draft.evidence_items,
        )
        tutor_turn = TutorTurn(
            id=tutor_turn_id,
            session_id=session.id,
            notebook_id=session.notebook_id,
            role=TutorMessageRole.TUTOR,
            content=draft.content,
            tutor_state=draft.tutor_state,
            message_type=draft.message_type,
            user_intent=draft.user_intent,
            escalation_action=escalation_action,
            citation_ids=citation_ids,
            evidence_pack_id=evidence_pack.id if draft.evidence_items else None,
            evidence_items=evidence_references,
            escalation_available=draft.escalation_available,
            follow_up_required=draft.follow_up_required,
            suggested_next_action=draft.suggested_next_action,
            suggested_actions=draft.suggested_actions,
            support_assessment=draft.support_assessment,
            insufficient_grounding=draft.insufficient_grounding,
            insufficiency_reason=draft.insufficiency_reason,
            language=draft.language,
            created_at=utc_now(),
        )
        tutor_repository.create_turn(tutor_turn)

        session.current_mode = draft.current_mode
        session.current_state = draft.tutor_state
        session.message_count += 1
        session.hint_level = draft.next_hint_level
        session.language = draft.language
        session.last_user_message = cleaned_content
        session.last_evidence_pack_id = evidence_pack.id if draft.evidence_items else None
        session.updated_at = utc_now()
        tutor_repository.update_session(session)

        return session, tutor_turn


service = TutorService()
