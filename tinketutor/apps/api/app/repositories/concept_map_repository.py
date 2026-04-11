from __future__ import annotations

from app.domain.models import ConceptEdge, ConceptMap, ConceptNode
from app.infra.firestore import (
    concept_map_edge_document,
    concept_map_edges_collection,
    concept_map_node_document,
    concept_map_nodes_collection,
    notebook_concept_map_document,
    notebook_concept_maps_collection,
)
from app.repositories._firestore_utils import (
    collection_group_first_model,
    delete_collection,
    load_models,
    save_model,
)


def create_map(concept_map: ConceptMap) -> ConceptMap:
    return save_model(
        notebook_concept_map_document(concept_map.notebook_id, concept_map.id),
        concept_map,
    )


def update_map(concept_map: ConceptMap) -> ConceptMap:
    return save_model(
        notebook_concept_map_document(concept_map.notebook_id, concept_map.id),
        concept_map,
    )


def get_map(concept_map_id: str) -> ConceptMap | None:
    return collection_group_first_model("conceptMaps", ConceptMap, id=concept_map_id)


def list_maps_for_notebook(notebook_id: str) -> list[ConceptMap]:
    concept_maps = load_models(notebook_concept_maps_collection(notebook_id).stream(), ConceptMap)
    concept_maps.sort(key=lambda concept_map: concept_map.created_at, reverse=True)
    return concept_maps


def get_latest_map_for_notebook(notebook_id: str) -> ConceptMap | None:
    concept_maps = list_maps_for_notebook(notebook_id)
    return concept_maps[0] if concept_maps else None


def create_nodes(nodes: list[ConceptNode]) -> list[ConceptNode]:
    for node in nodes:
        save_model(
            concept_map_node_document(node.notebook_id, node.concept_map_id, node.id),
            node,
        )
    return nodes


def replace_nodes_for_map(concept_map_id: str, nodes: list[ConceptNode]) -> list[ConceptNode]:
    concept_map = get_map(concept_map_id)
    if not concept_map:
        return nodes

    delete_collection(concept_map_nodes_collection(concept_map.notebook_id, concept_map_id))
    for node in nodes:
        save_model(
            concept_map_node_document(node.notebook_id, node.concept_map_id, node.id),
            node,
        )
    return nodes


def list_nodes_for_map(concept_map_id: str) -> list[ConceptNode]:
    concept_map = get_map(concept_map_id)
    if not concept_map:
        return []

    nodes = load_models(
        concept_map_nodes_collection(concept_map.notebook_id, concept_map_id).stream(),
        ConceptNode,
    )
    nodes.sort(key=lambda node: node.created_at)
    return nodes


def get_node(node_id: str) -> ConceptNode | None:
    return collection_group_first_model("nodes", ConceptNode, id=node_id)


def update_node(node: ConceptNode) -> ConceptNode:
    return save_model(
        concept_map_node_document(node.notebook_id, node.concept_map_id, node.id),
        node,
    )


def create_edges(edges: list[ConceptEdge]) -> list[ConceptEdge]:
    for edge in edges:
        save_model(
            concept_map_edge_document(edge.notebook_id, edge.concept_map_id, edge.id),
            edge,
        )
    return edges


def replace_edges_for_map(concept_map_id: str, edges: list[ConceptEdge]) -> list[ConceptEdge]:
    concept_map = get_map(concept_map_id)
    if not concept_map:
        return edges

    delete_collection(concept_map_edges_collection(concept_map.notebook_id, concept_map_id))
    for edge in edges:
        save_model(
            concept_map_edge_document(edge.notebook_id, edge.concept_map_id, edge.id),
            edge,
        )
    return edges


def list_edges_for_map(concept_map_id: str) -> list[ConceptEdge]:
    concept_map = get_map(concept_map_id)
    if not concept_map:
        return []

    edges = load_models(
        concept_map_edges_collection(concept_map.notebook_id, concept_map_id).stream(),
        ConceptEdge,
    )
    edges.sort(key=lambda edge: edge.created_at)
    return edges


def get_edge(edge_id: str) -> ConceptEdge | None:
    return collection_group_first_model("edges", ConceptEdge, id=edge_id)


def update_edge(edge: ConceptEdge) -> ConceptEdge:
    return save_model(
        concept_map_edge_document(edge.notebook_id, edge.concept_map_id, edge.id),
        edge,
    )
