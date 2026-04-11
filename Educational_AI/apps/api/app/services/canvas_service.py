from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from itertools import combinations
import math
import re
import unicodedata

from app.config import settings
from app.domain.enums import (
    CitationOutputType,
    CreatedBy,
    EvidenceSupport,
    MapGenerationStatus,
    NodeStatus,
    SupportAssessment,
)
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.models import (
    Chunk,
    ConceptEdge,
    ConceptEvidenceReference,
    ConceptMap,
    ConceptNode,
    Source,
)
from app.infra.store import new_id, utc_now
from app.providers.embedding import EmbeddingProvider
from app.providers.reranker import Reranker
from app.providers.vector_store import VectorStore
from app.repositories import concept_map_repository, knowledge_retrieval_repository
from app.services import citation_service, notebook_service, search_service


WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9-]*", flags=re.UNICODE)
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
PHRASE_BOUNDARY_WORDS = search_service.STOPWORDS | {
    "about",
    "after",
    "against",
    "around",
    "because",
    "before",
    "between",
    "both",
    "during",
    "each",
    "either",
    "every",
    "into",
    "most",
    "other",
    "over",
    "through",
    "under",
    "using",
    "via",
    "within",
    "without",
    "converts",
    "convert",
    "converted",
    "converting",
    "feeds",
    "feed",
    "fed",
    "generates",
    "generate",
    "generated",
    "generating",
    "gives",
    "give",
    "given",
    "happens",
    "happen",
    "happened",
    "inside",
    "leads",
    "lead",
    "led",
    "needs",
    "need",
    "needed",
    "occurs",
    "occur",
    "occurred",
    "produces",
    "produce",
    "produced",
    "producing",
    "requires",
    "require",
    "required",
    "results",
    "result",
    "resulted",
    "supports",
    "support",
    "supported",
    "takes",
    "take",
    "taken",
    "transforms",
    "transform",
    "transformed",
    "uses",
    "use",
    "used",
}
RELATION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bfeeds into\b", flags=re.IGNORECASE), "feeds into"),
    (re.compile(r"\boccurs in\b|\bhappens in\b|\btakes place in\b|\binside\b|\bwithin\b", flags=re.IGNORECASE), "occurs in"),
    (re.compile(r"\buses?\b", flags=re.IGNORECASE), "uses"),
    (re.compile(r"\bproduces?\b|\bgenerates?\b|\bgives rise to\b", flags=re.IGNORECASE), "produces"),
    (re.compile(r"\brequires?\b|\bdepends on\b", flags=re.IGNORECASE), "requires"),
    (re.compile(r"\bcontains?\b|\bincludes?\b", flags=re.IGNORECASE), "contains"),
    (re.compile(r"\bpart of\b|\bis a part of\b", flags=re.IGNORECASE), "part of"),
    (re.compile(r"\bleads to\b|\bresults in\b", flags=re.IGNORECASE), "leads to"),
    (re.compile(r"\bconverts?\b|\btransforms?\b", flags=re.IGNORECASE), "converts"),
    (re.compile(r"\bsupports?\b", flags=re.IGNORECASE), "supports"),
    (re.compile(r"\blinked to\b|\bassociated with\b", flags=re.IGNORECASE), "linked to"),
]


def _normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold().strip()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", _normalize_text(value))
    slug = re.sub(r"[-\s]+", "-", slug).strip("-")
    return slug


def _split_sentences(value: str) -> list[str]:
    return [sentence.strip() for sentence in SENTENCE_RE.split(value) if sentence.strip()]


def _tokenize_words(value: str) -> list[str]:
    return WORD_RE.findall(value)


def _clean_phrase(words: list[str]) -> str | None:
    if not words:
        return None
    phrase = " ".join(words).strip()
    normalized = _normalize_text(phrase)
    if not normalized:
        return None
    normalized_words = normalized.split()
    if len(normalized_words) > 4:
        return None
    if all(word in PHRASE_BOUNDARY_WORDS for word in normalized_words):
        return None
    if len(normalized_words) == 1:
        token = normalized_words[0]
        if len(token) < 3 and not token.isupper():
            return None
    if len(normalized) < 3:
        return None
    return phrase


def _extract_phrase_candidates(text: str) -> list[str]:
    phrases: list[str] = []
    for sentence in _split_sentences(text):
        current: list[str] = []
        for raw_word in _tokenize_words(sentence):
            normalized = _normalize_text(raw_word)
            if normalized in PHRASE_BOUNDARY_WORDS:
                phrase = _clean_phrase(current)
                if phrase:
                    phrases.append(phrase)
                current = []
                continue
            current.append(raw_word)
        phrase = _clean_phrase(current)
        if phrase:
            phrases.append(phrase)
    return phrases


def _candidate_score(
    *,
    phrase: str,
    phrase_frequency: int,
    chunk_frequency: int,
    source_frequency: int,
    title_hits: int,
) -> float:
    word_count = len(phrase.split())
    length_bonus = 0.2 if word_count > 1 else 0.0
    return (
        (chunk_frequency * 2.0)
        + source_frequency
        + (phrase_frequency * 0.35)
        + title_hits
        + length_bonus
    )


def _choose_best_label(labels: Counter[str]) -> str:
    return max(labels.items(), key=lambda item: (item[1], len(item[0]), item[0]))[0]


def _deduplicate_candidates(candidates: list[dict], max_candidates: int) -> list[str]:
    chosen: list[str] = []
    chosen_normalized: list[str] = []

    for candidate in sorted(
        candidates,
        key=lambda item: (
            item["score"],
            len(item["label"].split()),
            item["chunk_frequency"],
            item["label"],
        ),
        reverse=True,
    ):
        normalized = _normalize_text(candidate["label"])
        if normalized in chosen_normalized:
            continue
        if any(
            normalized in existing or existing in normalized
            for existing in chosen_normalized
        ):
            continue
        chosen.append(candidate["label"])
        chosen_normalized.append(normalized)
        if len(chosen) >= max_candidates:
            break

    return chosen


def _derive_candidate_labels(chunks: list[Chunk], sources_by_id: dict[str, Source]) -> list[str]:
    phrase_frequency: Counter[str] = Counter()
    chunk_occurrences: dict[str, set[str]] = defaultdict(set)
    source_occurrences: dict[str, set[str]] = defaultdict(set)
    title_hits: Counter[str] = Counter()
    label_variants: dict[str, Counter[str]] = defaultdict(Counter)

    for chunk in chunks:
        source = sources_by_id.get(chunk.source_id)
        text_blocks = [chunk.content]
        if chunk.position.section_title:
            text_blocks.append(chunk.position.section_title)
        if source:
            text_blocks.append(source.title)

        chunk_candidates: set[str] = set()
        for block in text_blocks:
            for phrase in _extract_phrase_candidates(block):
                normalized = _normalize_text(phrase)
                phrase_frequency[normalized] += 1
                label_variants[normalized][phrase] += 1
                chunk_candidates.add(normalized)
                if source and normalized in _normalize_text(source.title):
                    title_hits[normalized] += 1

        for normalized in chunk_candidates:
            chunk_occurrences[normalized].add(chunk.id)
            source_occurrences[normalized].add(chunk.source_id)

    raw_candidates: list[dict] = []
    for normalized, labels in label_variants.items():
        label = _choose_best_label(labels)
        chunk_frequency = len(chunk_occurrences[normalized])
        source_frequency = len(source_occurrences[normalized])
        if chunk_frequency == 0:
            continue
        score = _candidate_score(
            phrase=label,
            phrase_frequency=phrase_frequency[normalized],
            chunk_frequency=chunk_frequency,
            source_frequency=source_frequency,
            title_hits=title_hits[normalized],
        )
        raw_candidates.append(
            {
                "label": label,
                "score": score,
                "chunk_frequency": chunk_frequency,
            }
        )

    target = max(5, min(settings.canvas_node_target, len(raw_candidates)))
    return _deduplicate_candidates(raw_candidates, target)


def _support_rank(support: EvidenceSupport) -> int:
    return {
        EvidenceSupport.WEAK: 1,
        EvidenceSupport.PARTIAL: 2,
        EvidenceSupport.STRONG: 3,
    }[support]


def _best_support(supports: Iterable[EvidenceSupport]) -> EvidenceSupport:
    return max(supports, key=_support_rank, default=EvidenceSupport.WEAK)


def _build_summary(label: str, evidence_items: list[ConceptEvidenceReference]) -> str:
    if not evidence_items:
        return label
    snippet = evidence_items[0].snippet_text.strip().replace("\n", " ")
    if len(snippet) > 180:
        snippet = f"{snippet[:177].rstrip()}..."
    return snippet or label


def _build_reference_from_chunk(
    *,
    notebook_id: str,
    source: Source,
    chunk: Chunk,
    score: float,
    support: EvidenceSupport,
    rank: int,
) -> ConceptEvidenceReference | None:
    anchors = knowledge_retrieval_repository.list_anchors_for_source_chunk(chunk.source_id, chunk.id)
    valid, _reason = citation_service.validate_traceability(
        notebook_id=notebook_id,
        source=source,
        chunk=chunk,
        anchors=anchors,
    )
    if not valid or not anchors:
        return None
    anchor = anchors[0]
    return ConceptEvidenceReference(
        source_id=source.id,
        source_title=source.title,
        chunk_id=chunk.id,
        citation_ids=[],
        citation_anchor_ids=[item.id for item in anchors],
        snippet_text=anchor.snippet_text or chunk.content[:500],
        page_start=anchor.page_start,
        page_end=anchor.page_end,
        section_title=anchor.section_title,
        rank=rank,
        score=score,
        support=support,
    )


def _reference_from_evidence_item(item) -> ConceptEvidenceReference:
    return ConceptEvidenceReference(
        source_id=item.source_id,
        source_title=item.source_title,
        chunk_id=item.chunk_id,
        citation_ids=[],
        citation_anchor_ids=item.citation_anchor_ids,
        snippet_text=item.snippet_text,
        page_start=item.page_start,
        page_end=item.page_end,
        section_title=item.section_title,
        rank=item.rank,
        score=item.score,
        support=item.support,
    )


def _assign_positions(nodes: list[ConceptNode]) -> list[ConceptNode]:
    if not nodes:
        return nodes
    columns = min(3, max(2, math.ceil(math.sqrt(len(nodes)))))
    positioned: list[ConceptNode] = []
    ordered = sorted(
        nodes,
        key=lambda node: (-_support_rank(node.support), node.label.casefold()),
    )
    for index, node in enumerate(ordered):
        column = index % columns
        row = index // columns
        node.position_x = 160 + (column * 280)
        node.position_y = 100 + (row * 180)
        positioned.append(node)
    return positioned


def _build_guiding_question(label: str) -> str:
    return f"What is the role of {label} in this notebook, and which source passage supports your explanation?"


def _apply_completion_status(nodes: list[ConceptNode]) -> list[ConceptNode]:
    if not nodes:
        return nodes

    if len(nodes) >= 6:
        skeleton_target = min(settings.canvas_skeleton_nodes, max(2, len(nodes) - 2))
    else:
        skeleton_target = 1

    skeleton_candidates = sorted(
        nodes,
        key=lambda node: (
            _support_rank(node.support),
            node.source_coverage_count,
            len(node.label.split()),
            node.label.casefold(),
        ),
    )
    skeleton_ids = {node.id for node in skeleton_candidates[:skeleton_target]}

    for node in nodes:
        if node.id in skeleton_ids:
            node.status = NodeStatus.SKELETON
            node.guiding_question = _build_guiding_question(node.label)
            node.summary = ""
            node.note = ""
        else:
            node.status = NodeStatus.AI_GENERATED
            node.guiding_question = None

    return nodes


def _relation_from_between_text(text: str) -> str | None:
    last_match_index = -1
    selected_label: str | None = None
    for pattern, label in RELATION_PATTERNS:
        for match in pattern.finditer(text):
            if match.start() >= last_match_index:
                last_match_index = match.start()
                selected_label = label
    return selected_label


def _sentence_matches(sentence: str, nodes: list[ConceptNode]) -> list[tuple[ConceptNode, int, int]]:
    matches: list[tuple[ConceptNode, int, int]] = []
    lowered = _normalize_text(sentence)
    for node in nodes:
        variants = {node.label, node.stable_key.replace("-", " ")}
        best_match: tuple[int, int] | None = None
        for variant in variants:
            pattern = re.compile(rf"\b{re.escape(_normalize_text(variant))}\b")
            match = pattern.search(lowered)
            if match:
                candidate = (match.start(), match.end())
                if best_match is None or candidate[0] < best_match[0]:
                    best_match = candidate
        if best_match:
            matches.append((node, best_match[0], best_match[1]))
    matches.sort(key=lambda item: item[1])
    return matches


def _combine_support_for_edge(
    *,
    explicit_hits: int,
    supporting_chunk_count: int,
) -> EvidenceSupport:
    if explicit_hits >= 2 or supporting_chunk_count >= 3:
        return EvidenceSupport.STRONG
    if explicit_hits >= 1 or supporting_chunk_count >= 2:
        return EvidenceSupport.PARTIAL
    return EvidenceSupport.WEAK


async def _build_grounded_nodes(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
    source_ids: list[str],
    candidate_labels: list[str],
    vector_store: VectorStore,
    embedding_provider: EmbeddingProvider,
    reranker: Reranker,
) -> list[ConceptNode]:
    nodes: list[ConceptNode] = []
    used_stable_keys: set[str] = set()

    for label in candidate_labels:
        evidence_pack = await search_service.build_evidence_pack(
            notebook_id=notebook_id,
            user_id=user_id,
            query=label,
            requested_source_ids=source_ids,
            top_k=3,
            vector_store=vector_store,
            embedding_provider=embedding_provider,
            reranker=reranker,
        )
        if evidence_pack.insufficient_grounding or not evidence_pack.chunks:
            continue

        stable_key = _slugify(label)
        if not stable_key or stable_key in used_stable_keys:
            continue

        node_id = new_id()
        evidence_items = [
            _reference_from_evidence_item(item)
            for item in evidence_pack.chunks[:3]
        ]
        citation_ids: list[str] = []
        citation_anchor_ids = list({
            anchor_id
            for item in evidence_items
            for anchor_id in item.citation_anchor_ids
        })
        for item in evidence_items[:2]:
            citation = citation_service.create_output_citation_from_evidence(
                notebook_id=notebook_id,
                output_type=CitationOutputType.CANVAS_NODE,
                output_id=node_id,
                evidence_item=item,
            )
            citation_ids.append(citation.id)
            item.citation_ids.append(citation.id)

        support = _best_support(item.support for item in evidence_items)
        uncertain = (
            support != EvidenceSupport.STRONG
            or evidence_pack.support_assessment != SupportAssessment.SUPPORTED
        )
        now = utc_now()
        node = ConceptNode(
            id=node_id,
            notebook_id=notebook_id,
            concept_map_id=concept_map_id,
            stable_key=stable_key,
            label=label,
            summary=_build_summary(label, evidence_items),
            note="",
            support=support,
            uncertain=uncertain,
            needs_refinement=uncertain,
            citation_ids=citation_ids,
            citation_anchor_ids=citation_anchor_ids,
            evidence_items=evidence_items,
            source_ids=sorted({item.source_id for item in evidence_items}),
            source_coverage_count=len({item.source_id for item in evidence_items}),
            editable=True,
            created_by=CreatedBy.AI,
            created_at=now,
            updated_at=now,
        )
        used_stable_keys.add(stable_key)
        nodes.append(node)

    return _assign_positions(nodes)


def _build_edges(
    *,
    notebook_id: str,
    concept_map_id: str,
    nodes: list[ConceptNode],
    chunks: list[Chunk],
    sources_by_id: dict[str, Source],
) -> list[ConceptEdge]:
    if len(nodes) < 2:
        return []

    node_by_id = {node.id: node for node in nodes}
    edge_supports: dict[tuple[str, str, str], list[ConceptEvidenceReference]] = defaultdict(list)
    cooccurrence_counts: Counter[tuple[str, str]] = Counter()
    node_labels = {node.id: node.label for node in nodes}

    for chunk in chunks:
        source = sources_by_id.get(chunk.source_id)
        if source is None:
            continue

        chunk_matches: set[str] = set()
        for sentence in _split_sentences(chunk.content):
            sentence_matches = _sentence_matches(sentence, nodes)
            if len(sentence_matches) < 2:
                continue

            subject, _subject_start, subject_end = sentence_matches[0]
            chunk_matches.add(subject.id)
            for node, _start, _end in sentence_matches[1:]:
                chunk_matches.add(node.id)
                between_text = sentence[subject_end:_start] if _start >= subject_end else ""
                relation = _relation_from_between_text(between_text)
                if relation is None:
                    continue
                reference = _build_reference_from_chunk(
                    notebook_id=notebook_id,
                    source=source,
                    chunk=chunk,
                    score=1.0,
                    support=EvidenceSupport.PARTIAL,
                    rank=1,
                )
                if reference is None:
                    continue
                edge_supports[(subject.id, node.id, relation)].append(reference)

            for first, second in combinations(sorted(chunk_matches), 2):
                cooccurrence_counts[(first, second)] += 1

        if not chunk_matches:
            normalized_chunk = _normalize_text(chunk.content)
            for node in nodes:
                if re.search(rf"\b{re.escape(_normalize_text(node_labels[node.id]))}\b", normalized_chunk):
                    chunk_matches.add(node.id)
            for first, second in combinations(sorted(chunk_matches), 2):
                cooccurrence_counts[(first, second)] += 1

    edges: list[ConceptEdge] = []
    used_keys: set[tuple[str, str]] = set()

    for (source_node_id, target_node_id, relation), references in sorted(
        edge_supports.items(),
        key=lambda item: (len(item[1]), item[0][2], item[0][0], item[0][1]),
        reverse=True,
    ):
        edge_id = new_id()
        support = _combine_support_for_edge(
            explicit_hits=len(references),
            supporting_chunk_count=len({reference.chunk_id for reference in references}),
        )
        citation_ids: list[str] = []
        citation_anchor_ids = list({
            anchor_id
            for reference in references
            for anchor_id in reference.citation_anchor_ids
        })
        for index, reference in enumerate(references[:2], start=1):
            reference.rank = index
            citation = citation_service.create_output_citation_from_evidence(
                notebook_id=notebook_id,
                output_type=CitationOutputType.CANVAS_EDGE,
                output_id=edge_id,
                evidence_item=reference,
            )
            citation_ids.append(citation.id)
            reference.citation_ids.append(citation.id)

        now = utc_now()
        edge = ConceptEdge(
            id=edge_id,
            notebook_id=notebook_id,
            concept_map_id=concept_map_id,
            stable_key=f"{source_node_id}:{relation}:{target_node_id}",
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            label=relation,
            summary=_build_summary(relation, references[:1]),
            support=support,
            uncertain=support != EvidenceSupport.STRONG,
            needs_refinement=support != EvidenceSupport.STRONG,
            citation_ids=citation_ids,
            citation_anchor_ids=citation_anchor_ids,
            evidence_items=references[:2],
            source_ids=sorted({reference.source_id for reference in references}),
            source_coverage_count=len({reference.source_id for reference in references}),
            editable=True,
            created_by=CreatedBy.AI,
            created_at=now,
            updated_at=now,
        )
        edges.append(edge)
        used_keys.add(tuple(sorted((source_node_id, target_node_id))))

    max_cooccurrence_edges = max(2, min(len(nodes) * 2, settings.canvas_node_target + 2))
    for (left_id, right_id), count in cooccurrence_counts.most_common():
        undirected_key = tuple(sorted((left_id, right_id)))
        if undirected_key in used_keys:
            continue
        if left_id not in node_by_id or right_id not in node_by_id:
            continue
        supporting_chunks = [
            chunk
            for chunk in chunks
            if re.search(rf"\b{re.escape(_normalize_text(node_by_id[left_id].label))}\b", _normalize_text(chunk.content))
            and re.search(rf"\b{re.escape(_normalize_text(node_by_id[right_id].label))}\b", _normalize_text(chunk.content))
        ]
        references: list[ConceptEvidenceReference] = []
        for index, chunk in enumerate(supporting_chunks[:2], start=1):
            source = sources_by_id.get(chunk.source_id)
            if source is None:
                continue
            reference = _build_reference_from_chunk(
                notebook_id=notebook_id,
                source=source,
                chunk=chunk,
                score=min(1.0, 0.35 + (count * 0.15)),
                support=EvidenceSupport.PARTIAL if count >= 2 else EvidenceSupport.WEAK,
                rank=index,
            )
            if reference is not None:
                references.append(reference)
        if not references:
            continue

        edge_id = new_id()
        support = EvidenceSupport.PARTIAL if count >= 2 else EvidenceSupport.WEAK
        citation_ids: list[str] = []
        citation_anchor_ids = list({
            anchor_id
            for reference in references
            for anchor_id in reference.citation_anchor_ids
        })
        for reference in references:
            citation = citation_service.create_output_citation_from_evidence(
                notebook_id=notebook_id,
                output_type=CitationOutputType.CANVAS_EDGE,
                output_id=edge_id,
                evidence_item=reference,
            )
            citation_ids.append(citation.id)
            reference.citation_ids.append(citation.id)

        now = utc_now()
        edges.append(
            ConceptEdge(
                id=edge_id,
                notebook_id=notebook_id,
                concept_map_id=concept_map_id,
                stable_key=f"{left_id}:linked-in-sources:{right_id}",
                source_node_id=left_id,
                target_node_id=right_id,
                label="linked in sources",
                summary="This relationship is tentative and based on repeated co-occurrence in notebook evidence.",
                support=support,
                uncertain=True,
                needs_refinement=True,
                citation_ids=citation_ids,
                citation_anchor_ids=citation_anchor_ids,
                evidence_items=references,
                source_ids=sorted({reference.source_id for reference in references}),
                source_coverage_count=len({reference.source_id for reference in references}),
                editable=True,
                created_by=CreatedBy.AI,
                created_at=now,
                updated_at=now,
            )
        )
        used_keys.add(undirected_key)
        if len(edges) >= max_cooccurrence_edges:
            break

    return edges


def _update_map_failure(concept_map: ConceptMap, reason: str, diagnostics: dict | None = None) -> ConceptMap:
    concept_map.generation_status = MapGenerationStatus.FAILED
    concept_map.support_assessment = SupportAssessment.INSUFFICIENT_GROUNDING
    concept_map.insufficient_grounding = True
    concept_map.insufficiency_reason = reason
    concept_map.diagnostics = diagnostics or {}
    concept_map.updated_at = utc_now()
    concept_map.generated_at = utc_now()
    return concept_map_repository.update_map(concept_map)


async def generate_concept_map(
    *,
    notebook_id: str,
    user_id: str,
    source_ids: list[str] | None,
    vector_store: VectorStore,
    embedding_provider: EmbeddingProvider,
    reranker: Reranker,
) -> tuple[ConceptMap, list[ConceptNode], list[ConceptEdge]]:
    notebook = notebook_service.get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    notebook_source_ids = set(notebook.get("source_ids", []))
    now = utc_now()
    requested_source_ids = source_ids or notebook.get("source_ids", [])
    invalid_source_ids = [source_id for source_id in requested_source_ids if source_id not in notebook_source_ids]
    if invalid_source_ids:
        raise ValidationError(f"Source IDs are outside this notebook: {', '.join(invalid_source_ids)}")

    concept_map = concept_map_repository.create_map(
        ConceptMap(
            id=new_id(),
            notebook_id=notebook_id,
            user_id=user_id,
            title=f"{notebook.get('title', 'Notebook')} Concept Map",
            source_ids=requested_source_ids,
            generation_status=MapGenerationStatus.GENERATING,
            support_assessment=SupportAssessment.INSUFFICIENT_GROUNDING,
            insufficient_grounding=False,
            diagnostics={},
            created_at=now,
            updated_at=now,
            generated_at=None,
        )
    )

    ready_sources = knowledge_retrieval_repository.list_ready_sources(notebook_id, user_id)
    ready_sources_by_id = {source.id: source for source in ready_sources}
    scoped_source_ids = [source_id for source_id in requested_source_ids if source_id in ready_sources_by_id]

    if not scoped_source_ids:
        concept_map = _update_map_failure(
            concept_map,
            "The notebook has no ready sources available for concept-map generation.",
            diagnostics={
                "requested_source_count": len(requested_source_ids),
                "ready_source_count": len(ready_sources),
            },
        )
        return concept_map, [], []

    chunks = knowledge_retrieval_repository.list_chunks_for_source_ids(scoped_source_ids)
    if not chunks:
        concept_map = _update_map_failure(
            concept_map,
            "Ready sources exist, but no persisted chunks are available for concept-map generation.",
            diagnostics={"ready_source_count": len(ready_sources)},
        )
        return concept_map, [], []

    candidate_labels = _derive_candidate_labels(chunks, ready_sources_by_id)
    nodes = await _build_grounded_nodes(
        notebook_id=notebook_id,
        user_id=user_id,
        concept_map_id=concept_map.id,
        source_ids=scoped_source_ids,
        candidate_labels=candidate_labels,
        vector_store=vector_store,
        embedding_provider=embedding_provider,
        reranker=reranker,
    )
    if len(nodes) < 2:
        concept_map = _update_map_failure(
            concept_map,
            "The notebook does not contain enough strongly grounded concepts to assemble a concept map yet.",
            diagnostics={
                "candidate_label_count": len(candidate_labels),
                "grounded_node_count": len(nodes),
            },
        )
        return concept_map, [], []

    nodes = _apply_completion_status(nodes)

    edges = _build_edges(
        notebook_id=notebook_id,
        concept_map_id=concept_map.id,
        nodes=nodes,
        chunks=chunks,
        sources_by_id=ready_sources_by_id,
    )

    concept_map.node_ids = [node.id for node in nodes]
    concept_map.edge_ids = [edge.id for edge in edges]
    concept_map.generation_status = MapGenerationStatus.READY
    concept_map.support_assessment = (
        SupportAssessment.WEAK_EVIDENCE
        if any(node.uncertain for node in nodes) or any(edge.uncertain for edge in edges)
        else SupportAssessment.SUPPORTED
    )
    concept_map.insufficient_grounding = False
    concept_map.insufficiency_reason = None
    concept_map.diagnostics = {
        "candidate_label_count": len(candidate_labels),
        "grounded_node_count": len(nodes),
        "edge_count": len(edges),
        "skeleton_node_count": sum(1 for node in nodes if node.status == NodeStatus.SKELETON),
        "completed_node_count": sum(1 for node in nodes if node.status != NodeStatus.SKELETON),
        "uncertain_node_count": sum(1 for node in nodes if node.uncertain),
        "uncertain_edge_count": sum(1 for edge in edges if edge.uncertain),
        "retrieval_mode": "lexical_first",
        "llm_structured_pass_used": False,
    }
    concept_map.updated_at = utc_now()
    concept_map.generated_at = utc_now()

    concept_map_repository.update_map(concept_map)
    concept_map_repository.replace_nodes_for_map(concept_map.id, nodes)
    concept_map_repository.replace_edges_for_map(concept_map.id, edges)

    return concept_map, nodes, edges


def get_latest_concept_map(
    *,
    notebook_id: str,
    user_id: str,
) -> tuple[ConceptMap | None, list[ConceptNode], list[ConceptEdge]]:
    notebook = notebook_service.get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    concept_map = concept_map_repository.get_latest_map_for_notebook(notebook_id)
    if concept_map is None:
        return None, [], []

    nodes = concept_map_repository.list_nodes_for_map(concept_map.id)
    edges = concept_map_repository.list_edges_for_map(concept_map.id)
    return concept_map, nodes, edges


def get_concept_map(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
) -> tuple[ConceptMap, list[ConceptNode], list[ConceptEdge]]:
    notebook = notebook_service.get_notebook(notebook_id, user_id)
    if not notebook:
        raise NotFoundError("Notebook", notebook_id)

    concept_map = concept_map_repository.get_map(concept_map_id)
    if concept_map is None or concept_map.notebook_id != notebook_id:
        raise NotFoundError("ConceptMap", concept_map_id)

    nodes = concept_map_repository.list_nodes_for_map(concept_map.id)
    edges = concept_map_repository.list_edges_for_map(concept_map.id)
    return concept_map, nodes, edges


def update_concept_node(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
    node_id: str,
    label: str | None = None,
    summary: str | None = None,
    note: str | None = None,
    position_x: float | None = None,
    position_y: float | None = None,
) -> ConceptNode:
    _concept_map, _nodes, _edges = get_concept_map(
        notebook_id=notebook_id,
        user_id=user_id,
        concept_map_id=concept_map_id,
    )
    node = concept_map_repository.get_node(node_id)
    if node is None or node.concept_map_id != concept_map_id:
        raise NotFoundError("ConceptNode", node_id)

    original_label = node.label
    original_summary = node.summary
    original_note = node.note

    if label is not None and label.strip():
        node.label = label.strip()
        node.stable_key = _slugify(node.label)
    if summary is not None:
        node.summary = summary.strip()
    if note is not None:
        node.note = note.strip()
    if position_x is not None:
        node.position_x = position_x
    if position_y is not None:
        node.position_y = position_y

    changed_text_fields = (
        node.label != original_label
        or node.summary != original_summary
        or node.note != original_note
    )
    if node.status == NodeStatus.SKELETON and changed_text_fields:
        if (
            node.summary.strip()
            or node.note.strip()
            or node.label.strip() != original_label.strip()
        ):
            node.status = NodeStatus.STUDENT_FILLED

    node.updated_at = utc_now()
    return concept_map_repository.update_node(node)


def update_concept_edge(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
    edge_id: str,
    label: str | None = None,
    summary: str | None = None,
) -> ConceptEdge:
    _concept_map, _nodes, _edges = get_concept_map(
        notebook_id=notebook_id,
        user_id=user_id,
        concept_map_id=concept_map_id,
    )
    edge = concept_map_repository.get_edge(edge_id)
    if edge is None or edge.concept_map_id != concept_map_id:
        raise NotFoundError("ConceptEdge", edge_id)

    if label is not None and label.strip():
        edge.label = label.strip()
        edge.needs_refinement = False
        edge.uncertain = edge.support != EvidenceSupport.STRONG
        edge.stable_key = f"{edge.source_node_id}:{_slugify(edge.label)}:{edge.target_node_id}"
    if summary is not None:
        edge.summary = summary.strip()
    edge.updated_at = utc_now()
    return concept_map_repository.update_edge(edge)


def inspect_concept_node(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
    node_id: str,
) -> ConceptNode:
    _concept_map, _nodes, _edges = get_concept_map(
        notebook_id=notebook_id,
        user_id=user_id,
        concept_map_id=concept_map_id,
    )
    node = concept_map_repository.get_node(node_id)
    if node is None or node.concept_map_id != concept_map_id:
        raise NotFoundError("ConceptNode", node_id)
    return node


def inspect_concept_edge(
    *,
    notebook_id: str,
    user_id: str,
    concept_map_id: str,
    edge_id: str,
) -> ConceptEdge:
    _concept_map, _nodes, _edges = get_concept_map(
        notebook_id=notebook_id,
        user_id=user_id,
        concept_map_id=concept_map_id,
    )
    edge = concept_map_repository.get_edge(edge_id)
    if edge is None or edge.concept_map_id != concept_map_id:
        raise NotFoundError("ConceptEdge", edge_id)
    return edge
