from __future__ import annotations

from collections import defaultdict
import re

from app.domain.enums import (
    EvidenceSupport,
    GapFindingType,
    JobStatus,
    JobType,
    Language,
    NodeStatus,
    SuggestedTarget,
    SupportAssessment,
)
from app.domain.models import GapEvidence, GapFinding, GapReport, ProcessingJob
from app.infra.store import new_id, utc_now
from app.repositories import (
    concept_map_repository,
    gap_repository,
    knowledge_retrieval_repository,
    quiz_repository,
    source_ingestion_repository,
    tutor_repository,
)


TOKEN_RE = re.compile(r"\w+", flags=re.UNICODE)


def create_gap_analysis_job(notebook_id: str, user_id: str) -> str:
    now = utc_now()
    job = ProcessingJob(
        id=new_id(),
        user_id=user_id,
        notebook_id=notebook_id,
        source_id=None,
        type=JobType.GAP_ANALYSIS,
        status=JobStatus.QUEUED,
        target_id=notebook_id,
        stage="queued",
        progress=0,
        result=None,
        error_message=None,
        created_at=now,
        updated_at=now,
    )
    source_ingestion_repository.create_job(job)
    return job.id


def _normalize_topic(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.casefold()).strip()
    return normalized[:160]


def _topic_tokens(value: str) -> set[str]:
    return set(TOKEN_RE.findall(_normalize_topic(value)))


def _topic_overlap(left: str, right: str) -> float:
    left_tokens = _topic_tokens(left)
    right_tokens = _topic_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _best_matching_node(text: str, source_ids: list[str], nodes: list) -> object | None:
    best_node = None
    best_score = 0.0
    source_id_set = set(source_ids)
    for node in nodes:
        score = max(
            _topic_overlap(text, node.label),
            _topic_overlap(text, node.guiding_question or ""),
            _topic_overlap(text, node.summary or ""),
        )
        if source_id_set and source_id_set & set(node.source_ids):
            score += 0.2
        if score > best_score:
            best_score = score
            best_node = node
    return best_node if best_score >= 0.12 else None


def _find_group_key(topic: str, groups: dict[str, dict]) -> str:
    normalized = _normalize_topic(topic)
    if normalized in groups:
        return normalized

    best_key = normalized
    best_score = 0.0
    for key, group in groups.items():
        score = _topic_overlap(topic, group["topic"])
        if score > best_score:
            best_score = score
            best_key = key

    return best_key if best_score >= 0.5 else normalized


def _get_or_create_group(groups: dict[str, dict], topic: str) -> dict:
    key = _find_group_key(topic, groups)
    if key not in groups:
        groups[key] = {
            "topic": topic.strip(),
            "signal_types": set(),
            "source_ids": set(),
            "evidence": [],
            "linked_node_ids": set(),
            "linked_edge_ids": set(),
            "linked_quiz_ids": set(),
            "citation_ids": set(),
            "citation_anchor_ids": set(),
        }
    return groups[key]


def _add_evidence(
    group: dict,
    *,
    evidence_type: str,
    reference_id: str,
    detail: str,
    source_ids: list[str] | None = None,
    linked_node_ids: list[str] | None = None,
    linked_edge_ids: list[str] | None = None,
    linked_quiz_ids: list[str] | None = None,
    citation_ids: list[str] | None = None,
    citation_anchor_ids: list[str] | None = None,
) -> None:
    group["signal_types"].add(evidence_type)
    group["evidence"].append(
        GapEvidence(
            type=evidence_type,
            reference_id=reference_id,
            detail=detail,
        )
    )
    group["source_ids"].update(source_ids or [])
    group["linked_node_ids"].update(linked_node_ids or [])
    group["linked_edge_ids"].update(linked_edge_ids or [])
    group["linked_quiz_ids"].update(linked_quiz_ids or [])
    group["citation_ids"].update(citation_ids or [])
    group["citation_anchor_ids"].update(citation_anchor_ids or [])


def _collect_chunk_ids_from_citations(citation_ids: list[str]) -> set[str]:
    chunk_ids: set[str] = set()
    for citation_id in citation_ids:
        citation = knowledge_retrieval_repository.get_citation(citation_id)
        if citation:
            chunk_ids.add(citation.chunk_id)
    return chunk_ids


def _collect_chunk_ids_from_anchors(anchor_ids: list[str]) -> set[str]:
    chunk_ids: set[str] = set()
    for anchor_id in anchor_ids:
        anchor = knowledge_retrieval_repository.get_anchor(anchor_id)
        if anchor:
            chunk_ids.add(anchor.chunk_id)
    return chunk_ids


def _collect_interacted_chunk_ids(
    *,
    nodes: list,
    edges: list,
    quiz_items: list,
    quiz_attempts: list,
    tutor_turns: list,
) -> set[str]:
    interacted_chunk_ids: set[str] = set()

    for node in nodes:
        interacted_chunk_ids.update(item.chunk_id for item in node.evidence_items)
        interacted_chunk_ids.update(_collect_chunk_ids_from_citations(node.citation_ids))
        interacted_chunk_ids.update(_collect_chunk_ids_from_anchors(node.citation_anchor_ids))

    for edge in edges:
        interacted_chunk_ids.update(item.chunk_id for item in edge.evidence_items)
        interacted_chunk_ids.update(_collect_chunk_ids_from_citations(edge.citation_ids))
        interacted_chunk_ids.update(_collect_chunk_ids_from_anchors(edge.citation_anchor_ids))

    quiz_items_by_id = {item.id: item for item in quiz_items}
    for item in quiz_items:
        interacted_chunk_ids.update(_collect_chunk_ids_from_citations(item.citation_ids))

    for attempt in quiz_attempts:
        quiz_item = quiz_items_by_id.get(attempt.quiz_item_id)
        if quiz_item:
            interacted_chunk_ids.update(_collect_chunk_ids_from_citations(quiz_item.citation_ids))

    for turn in tutor_turns:
        interacted_chunk_ids.update(item.chunk_id for item in turn.evidence_items)
        interacted_chunk_ids.update(_collect_chunk_ids_from_citations(turn.citation_ids))

    return interacted_chunk_ids


def _infer_quiz_topic(quiz_item, nodes: list) -> str:
    if getattr(quiz_item, "topic", None):
        return quiz_item.topic

    text = " ".join(
        part
        for part in [quiz_item.question, quiz_item.correct_answer, quiz_item.explanation]
        if part
    )
    matching_node = _best_matching_node(text, quiz_item.source_ids, nodes)
    if matching_node:
        return matching_node.label
    return quiz_item.question.rstrip(" ?!.")


def _infer_chunk_topic(chunk, nodes: list) -> str:
    matching_node = _best_matching_node(chunk.content, [chunk.source_id], nodes)
    if matching_node:
        return matching_node.label
    if chunk.position.section_title:
        return chunk.position.section_title
    source = knowledge_retrieval_repository.get_source(chunk.source_id)
    if source:
        return source.title
    return f"Source page {chunk.position.page_start}"


def _build_gap_description(signal_types: set[str]) -> str:
    has_canvas = "canvas_empty" in signal_types
    has_quiz = "quiz_failure" in signal_types
    has_coverage = "low_coverage" in signal_types

    if has_canvas and has_quiz and has_coverage:
        return "This topic is still unresolved on the canvas, has incorrect quiz performance, and relevant source material has not been revisited."
    if has_canvas and has_quiz:
        return "This topic is still unresolved on the canvas and recent quiz attempts show the concept is not secure yet."
    if has_canvas and has_coverage:
        return "This topic remains incomplete on the canvas and relevant source material has not yet been used elsewhere in the learning loop."
    if has_quiz and has_coverage:
        return "Recent quiz attempts were incorrect and relevant source material has seen little or no follow-up interaction."
    if has_canvas:
        return "This concept is still incomplete on the synthesis canvas."
    if has_quiz:
        return "Recent quiz attempts on this topic were incorrect."
    return "Relevant notebook material has not yet been used in the canvas, tutor, or quiz flow."


def _gap_confidence(signal_types: set[str], evidence_count: int) -> float:
    confidence = 0.35
    if "canvas_empty" in signal_types:
        confidence += 0.25
    if "quiz_failure" in signal_types:
        confidence += 0.3
    if "low_coverage" in signal_types:
        confidence += 0.15
    if len(signal_types) >= 2:
        confidence += 0.1
    if evidence_count >= 3:
        confidence += 0.05
    return min(confidence, 0.95)


def _severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.8:
        return "high"
    if confidence >= 0.55:
        return "medium"
    return "low"


def _support_from_confidence(confidence: float) -> EvidenceSupport:
    if confidence >= 0.8:
        return EvidenceSupport.STRONG
    if confidence >= 0.55:
        return EvidenceSupport.PARTIAL
    return EvidenceSupport.WEAK


def _suggested_target(group: dict) -> SuggestedTarget:
    if group["linked_node_ids"]:
        return SuggestedTarget.CANVAS_NODE
    if group["linked_edge_ids"]:
        return SuggestedTarget.CANVAS_EDGE
    return SuggestedTarget.QUIZ


def _suggested_action(group: dict) -> str:
    if group["linked_node_ids"]:
        return "Open this concept on the canvas"
    if group["linked_edge_ids"]:
        return "Open this relationship on the canvas"
    return "Review this topic in quiz mode"


def _build_topic_findings(
    *,
    report_id: str,
    notebook_id: str,
    groups: dict[str, dict],
) -> list[GapFinding]:
    findings: list[GapFinding] = []

    ordered_groups = sorted(
        groups.values(),
        key=lambda group: (
            _gap_confidence(group["signal_types"], len(group["evidence"])),
            len(group["evidence"]),
            group["topic"],
        ),
        reverse=True,
    )

    for group in ordered_groups:
        confidence = _gap_confidence(group["signal_types"], len(group["evidence"]))
        severity = _severity_from_confidence(confidence)
        support = _support_from_confidence(confidence)
        suggested_target = _suggested_target(group)

        findings.append(
            GapFinding(
                id=new_id(),
                notebook_id=notebook_id,
                gap_report_id=report_id,
                finding_type=GapFindingType.LOW_SUPPORT_AREA,
                topic=group["topic"],
                description=_build_gap_description(group["signal_types"]),
                confidence=confidence,
                evidence=list(group["evidence"]),
                source_ids=sorted(group["source_ids"]),
                title=group["topic"],
                severity=severity,
                support=support,
                uncertain=confidence < 0.8,
                citation_ids=sorted(group["citation_ids"]),
                citation_anchor_ids=sorted(group["citation_anchor_ids"]),
                linked_node_ids=sorted(group["linked_node_ids"]),
                linked_edge_ids=sorted(group["linked_edge_ids"]),
                linked_quiz_ids=sorted(group["linked_quiz_ids"]),
                suggested_target=suggested_target,
                suggested_next_action=_suggested_action(group),
                suggested_study_mode="Focused quiz" if suggested_target == SuggestedTarget.QUIZ else "Canvas review",
                language=Language.UNKNOWN,
                created_at=utc_now(),
            )
        )

    return findings


async def run_gap_analysis(notebook_id: str, user_id: str, job_id: str) -> None:
    job = source_ingestion_repository.get_job(job_id)
    if not job:
        return

    running_at = utc_now()
    job.status = JobStatus.RUNNING
    job.stage = "collecting_signals"
    job.progress = 20
    job.started_at = running_at
    job.updated_at = running_at
    source_ingestion_repository.update_job(job)

    report = GapReport(
        id=new_id(),
        notebook_id=notebook_id,
        user_id=user_id,
        status=JobStatus.RUNNING,
        support_assessment=SupportAssessment.INSUFFICIENT_GROUNDING,
        diagnostics={},
        finding_ids=[],
        created_at=running_at,
        updated_at=running_at,
    )
    gap_repository.create_gap_report(report)

    try:
        concept_map = concept_map_repository.get_latest_map_for_notebook(notebook_id)
        nodes = concept_map_repository.list_nodes_for_map(concept_map.id) if concept_map else []
        edges = concept_map_repository.list_edges_for_map(concept_map.id) if concept_map else []
        if concept_map:
            report.concept_map_id = concept_map.id

        quiz_items = quiz_repository.list_quiz_items_for_notebook(notebook_id)
        quiz_attempts = quiz_repository.list_quiz_attempts_for_user(user_id, notebook_id)

        tutor_sessions = tutor_repository.list_sessions_for_notebook(notebook_id, user_id)
        tutor_turns = []
        for session in tutor_sessions:
            tutor_turns.extend(tutor_repository.list_turns_for_session(session.id))

        groups: dict[str, dict] = {}

        job.stage = "analyzing_canvas"
        job.progress = 40
        source_ingestion_repository.update_job(job)

        uncertain_edges_by_node_id: dict[str, list] = defaultdict(list)
        for edge in edges:
            if edge.uncertain:
                uncertain_edges_by_node_id[edge.source_node_id].append(edge)
                uncertain_edges_by_node_id[edge.target_node_id].append(edge)

        for node in nodes:
            if node.status != NodeStatus.SKELETON:
                continue

            topic = node.label.strip() or (node.guiding_question or "Incomplete concept")
            group = _get_or_create_group(groups, topic)
            edge_labels = [edge.label for edge in uncertain_edges_by_node_id.get(node.id, [])[:2] if edge.label]
            detail = "This concept is still marked as a skeleton node."
            if node.guiding_question:
                detail += f" Guiding question: {node.guiding_question}"
            if edge_labels:
                detail += f" Connected tentative relationships: {', '.join(edge_labels)}."

            _add_evidence(
                group,
                evidence_type="canvas_empty",
                reference_id=node.id,
                detail=detail,
                source_ids=node.source_ids,
                linked_node_ids=[node.id],
                citation_ids=node.citation_ids,
                citation_anchor_ids=node.citation_anchor_ids,
            )

        job.stage = "analyzing_quiz"
        job.progress = 60
        source_ingestion_repository.update_job(job)

        quiz_items_by_id = {item.id: item for item in quiz_items}
        for attempt in quiz_attempts:
            if attempt.is_correct:
                continue
            quiz_item = quiz_items_by_id.get(attempt.quiz_item_id)
            if not quiz_item:
                continue

            topic = _infer_quiz_topic(quiz_item, nodes)
            group = _get_or_create_group(groups, topic)
            _add_evidence(
                group,
                evidence_type="quiz_failure",
                reference_id=attempt.id,
                detail=f"Incorrect quiz attempt on: {quiz_item.question}",
                source_ids=quiz_item.source_ids,
                linked_quiz_ids=[quiz_item.id],
                citation_ids=quiz_item.citation_ids,
            )

        job.stage = "analyzing_coverage"
        job.progress = 75
        source_ingestion_repository.update_job(job)

        interacted_chunk_ids = _collect_interacted_chunk_ids(
            nodes=nodes,
            edges=edges,
            quiz_items=quiz_items,
            quiz_attempts=quiz_attempts,
            tutor_turns=tutor_turns,
        )

        ready_sources = knowledge_retrieval_repository.list_ready_sources(notebook_id, user_id)
        all_chunks = knowledge_retrieval_repository.list_chunks_for_source_ids([source.id for source in ready_sources])
        for chunk in all_chunks:
            if chunk.id in interacted_chunk_ids:
                continue

            topic = _infer_chunk_topic(chunk, nodes)
            group = _get_or_create_group(groups, topic)
            source = knowledge_retrieval_repository.get_source(chunk.source_id)
            section = chunk.position.section_title or f"page {chunk.position.page_start}"
            _add_evidence(
                group,
                evidence_type="low_coverage",
                reference_id=chunk.id,
                detail=f"No canvas, tutor, or quiz interaction has used this source chunk yet ({source.title if source else 'Source'}, {section}).",
                source_ids=[chunk.source_id],
            )

        findings = _build_topic_findings(
            report_id=report.id,
            notebook_id=notebook_id,
            groups=groups,
        )
        if findings:
            gap_repository.create_gap_findings(findings)

        report.finding_ids = [finding.id for finding in findings]
        report.support_assessment = (
            SupportAssessment.WEAK_EVIDENCE
            if findings
            else SupportAssessment.SUPPORTED
        )
        report.status = JobStatus.COMPLETED
        report.updated_at = utc_now()
        report.diagnostics = {
            "concept_map_id": report.concept_map_id,
            "skeleton_node_count": sum(1 for node in nodes if node.status == NodeStatus.SKELETON),
            "incorrect_quiz_attempt_count": sum(1 for attempt in quiz_attempts if not attempt.is_correct),
            "zero_interaction_chunk_count": sum(1 for chunk in all_chunks if chunk.id not in interacted_chunk_ids),
            "topic_gap_count": len(findings),
        }
        gap_repository.update_gap_report(report)

        completed_at = utc_now()
        job.status = JobStatus.COMPLETED
        job.stage = "completed"
        job.progress = 100
        job.result = {
            "gap_report_id": report.id,
            "finding_count": len(findings),
        }
        job.updated_at = completed_at
        job.completed_at = completed_at
        source_ingestion_repository.update_job(job)
    except Exception as exc:
        failed_at = utc_now()
        report.status = JobStatus.FAILED
        report.updated_at = failed_at
        report.diagnostics = {"error": str(exc)}
        gap_repository.update_gap_report(report)

        job.status = JobStatus.FAILED
        job.stage = "failed"
        job.progress = 100
        job.error_message = str(exc)
        job.updated_at = failed_at
        job.completed_at = failed_at
        source_ingestion_repository.update_job(job)
        raise
