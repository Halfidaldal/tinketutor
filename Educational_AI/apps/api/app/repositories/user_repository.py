from __future__ import annotations

from app.domain.models import UserProfile
from app.infra.firestore import user_document
from app.repositories._firestore_utils import load_model, save_model


def get_by_id(user_id: str) -> UserProfile | None:
    return load_model(user_document(user_id), UserProfile)


def create(profile: UserProfile) -> UserProfile:
    return save_model(user_document(profile.id), profile)


def update(profile: UserProfile) -> UserProfile:
    return save_model(user_document(profile.id), profile)
