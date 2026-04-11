from __future__ import annotations

from app.domain.models import GapReport, GapFinding
from app.infra.firestore import (
    gap_report_finding_document,
    gap_report_findings_collection,
    notebook_gap_report_document,
    notebook_gap_reports_collection,
)
from app.repositories._firestore_utils import collection_group_first_model, load_models, save_model


def create_gap_report(report: GapReport) -> GapReport:
    return save_model(notebook_gap_report_document(report.notebook_id, report.id), report)


def update_gap_report(report: GapReport) -> GapReport:
    return save_model(notebook_gap_report_document(report.notebook_id, report.id), report)


def get_gap_report(report_id: str) -> GapReport | None:
    return collection_group_first_model("gapReports", GapReport, id=report_id)


def list_gap_reports_for_notebook(notebook_id: str) -> list[GapReport]:
    reports = load_models(notebook_gap_reports_collection(notebook_id).stream(), GapReport)
    reports.sort(key=lambda item: item.created_at, reverse=True)
    return reports


def get_latest_gap_report_for_notebook(notebook_id: str) -> GapReport | None:
    reports = list_gap_reports_for_notebook(notebook_id)
    return reports[0] if reports else None


def create_gap_findings(findings: list[GapFinding]) -> list[GapFinding]:
    for finding in findings:
        save_model(
            gap_report_finding_document(finding.notebook_id, finding.gap_report_id, finding.id),
            finding,
        )
    return findings


def list_gap_findings_for_report(report_id: str) -> list[GapFinding]:
    report = get_gap_report(report_id)
    if not report:
        return []

    findings = load_models(
        gap_report_findings_collection(report.notebook_id, report_id).stream(),
        GapFinding,
    )
    findings.sort(key=lambda finding: finding.created_at)
    return findings
