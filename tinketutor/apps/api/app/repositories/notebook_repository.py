from __future__ import annotations

from app.domain.models import Notebook
from app.infra.firestore import notebook_document, notebooks_collection, recursive_delete
from app.repositories._firestore_utils import load_model, load_models, save_model


def create(notebook: Notebook) -> Notebook:
    return save_model(notebook_document(notebook.id), notebook)


def get_by_id(notebook_id: str) -> Notebook | None:
    return load_model(notebook_document(notebook_id), Notebook)


def list_by_user(user_id: str) -> list[Notebook]:
    query = notebooks_collection().where("user_id", "==", user_id)
    notebooks = load_models(query.stream(), Notebook)
    notebooks.sort(key=lambda notebook: notebook.created_at, reverse=True)
    return notebooks


def update(notebook: Notebook) -> Notebook:
    return save_model(notebook_document(notebook.id), notebook)


def delete(notebook_id: str) -> None:
    recursive_delete(notebook_document(notebook_id))
