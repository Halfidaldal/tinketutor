from __future__ import annotations

from collections.abc import Iterable
from typing import TypeVar

from pydantic import BaseModel

from app.infra.firestore import collection_group, get_document_data


ModelT = TypeVar("ModelT", bound=BaseModel)


def serialize_model(model: BaseModel) -> dict:
    return model.model_dump(mode="json")


def save_model(doc_ref, model: ModelT) -> ModelT:
    doc_ref.set(serialize_model(model))
    return model


def load_model(doc_ref, model_cls: type[ModelT]) -> ModelT | None:
    payload = get_document_data(doc_ref)
    return model_cls.model_validate(payload) if payload else None


def load_models(snapshots: Iterable, model_cls: type[ModelT]) -> list[ModelT]:
    return [
        model_cls.model_validate(snapshot.to_dict())
        for snapshot in snapshots
        if snapshot.exists
    ]


def collection_group_models(collection_name: str, model_cls: type[ModelT], **filters) -> list[ModelT]:
    query = collection_group(collection_name)
    for field_name, value in filters.items():
        query = query.where(field_name, "==", value)
    return load_models(query.stream(), model_cls)


def collection_group_first_model(collection_name: str, model_cls: type[ModelT], **filters) -> ModelT | None:
    models = collection_group_models(collection_name, model_cls, **filters)
    return models[0] if models else None


def delete_collection(collection_ref) -> None:
    for snapshot in collection_ref.stream():
        snapshot.reference.delete()
