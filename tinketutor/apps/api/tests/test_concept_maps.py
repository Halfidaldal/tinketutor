from __future__ import annotations

import io
import time
import zipfile


def _make_minimal_docx(text_blocks: list[str]) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"
        for text in text_blocks
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def _create_notebook(client, auth_headers, *, title: str = "Cell Biology") -> str:
    response = client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": title, "description": "Concept-map test notebook"},
    )
    assert response.status_code == 201
    return response.json()["notebook"]["id"]


def _upload_ready_source(client, auth_headers, notebook_id: str) -> None:
    docx_bytes = _make_minimal_docx(
        [
            "Cellular respiration converts glucose into ATP inside the mitochondria.",
            "Glycolysis occurs in the cytoplasm and produces pyruvate.",
            "The Krebs cycle generates electron carriers for oxidative phosphorylation.",
            "Oxidative phosphorylation uses the electron transport chain to produce most ATP.",
        ]
    )

    upload_response = client.post(
        "/api/v1/sources",
        headers=auth_headers,
        data={"title": "Respiration Primer", "notebookId": notebook_id},
        files={
            "file": (
                "respiration.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload_response.status_code == 202
    job_id = upload_response.json()["jobId"]

    for _ in range(30):
        job_response = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
        assert job_response.status_code == 200
        job = job_response.json()["job"]
        if job["status"] in {"completed", "failed"}:
            assert job["status"] == "completed"
            return
        time.sleep(0.1)

    raise AssertionError("Timed out waiting for ingestion to complete")


def test_generate_concept_map_returns_persisted_grounded_graph(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers)
    _upload_ready_source(client, auth_headers, notebook_id)

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/concept-maps",
        headers=auth_headers,
        json={},
    )
    assert response.status_code == 201

    payload = response.json()
    concept_map = payload["concept_map"]
    nodes = payload["nodes"]
    edges = payload["edges"]

    assert concept_map["notebook_id"] == notebook_id
    assert concept_map["generation_status"] == "ready"
    assert concept_map["support_assessment"] in {"supported", "weak_evidence"}
    assert len(nodes) >= 4
    assert len(edges) >= 1
    assert any(
        expected in node["label"].casefold()
        for node in nodes
        for expected in {"cellular respiration", "glycolysis", "oxidative phosphorylation"}
    )
    assert all(node["status"] in {"skeleton", "ai_generated", "student_filled", "verified"} for node in nodes)
    skeleton_nodes = [node for node in nodes if node["status"] == "skeleton"]
    assert skeleton_nodes
    assert all(node["guiding_question"] for node in skeleton_nodes)
    assert all(node["citation_ids"] for node in nodes)
    assert all(edge["citation_ids"] for edge in edges)
    assert any(edge["label"] in {"produces", "occurs in", "linked in sources"} for edge in edges)

    latest_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/concept-maps/latest",
        headers=auth_headers,
    )
    assert latest_response.status_code == 200
    assert latest_response.json()["concept_map"]["id"] == concept_map["id"]

    notebook_response = client.get(
        f"/api/v1/notebooks/{notebook_id}",
        headers=auth_headers,
    )
    assert notebook_response.status_code == 200
    notebook_payload = notebook_response.json()
    assert notebook_payload["concept_map"]["id"] == concept_map["id"]
    assert len(notebook_payload["nodes"]) == len(nodes)
    assert len(notebook_payload["edges"]) == len(edges)
    assert any(node["status"] == "skeleton" for node in notebook_payload["nodes"])
    assert any(node["guiding_question"] for node in notebook_payload["nodes"] if node["status"] == "skeleton")


def test_update_concept_node_persists_editable_fields(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Editable Map")
    _upload_ready_source(client, auth_headers, notebook_id)

    generate_response = client.post(
        f"/api/v1/notebooks/{notebook_id}/concept-maps",
        headers=auth_headers,
        json={},
    )
    assert generate_response.status_code == 201
    concept_map = generate_response.json()["concept_map"]
    generated_nodes = generate_response.json()["nodes"]
    node = next(node for node in generated_nodes if node["status"] == "skeleton")

    update_response = client.put(
        f"/api/v1/notebooks/{notebook_id}/concept-maps/{concept_map['id']}/nodes/{node['id']}",
        headers=auth_headers,
        json={
            "label": "Refined Concept Label",
            "summary": "Student-authored summary grounded in the notebook.",
            "note": "Student-authored refinement.",
            "positionX": 480,
            "positionY": 240,
        },
    )
    assert update_response.status_code == 200

    updated_node = update_response.json()["node"]
    assert updated_node["label"] == "Refined Concept Label"
    assert updated_node["summary"] == "Student-authored summary grounded in the notebook."
    assert updated_node["note"] == "Student-authored refinement."
    assert updated_node["status"] == "student_filled"
    assert updated_node["position_x"] == 480
    assert updated_node["position_y"] == 240

    inspect_response = client.get(
        f"/api/v1/notebooks/{notebook_id}/concept-maps/{concept_map['id']}/nodes/{node['id']}",
        headers=auth_headers,
    )
    assert inspect_response.status_code == 200
    assert inspect_response.json()["node"]["label"] == "Refined Concept Label"
    assert inspect_response.json()["node"]["status"] == "student_filled"


def test_generate_concept_map_returns_explicit_failed_map_when_notebook_is_not_ready(client, auth_headers):
    notebook_id = _create_notebook(client, auth_headers, title="Empty Concept Notebook")

    response = client.post(
        f"/api/v1/notebooks/{notebook_id}/concept-maps",
        headers=auth_headers,
        json={},
    )
    assert response.status_code == 201

    payload = response.json()
    assert payload["concept_map"]["generation_status"] == "failed"
    assert payload["concept_map"]["insufficient_grounding"] is True
    assert payload["concept_map"]["insufficiency_reason"]
    assert payload["nodes"] == []
    assert payload["edges"] == []
