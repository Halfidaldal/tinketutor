"""
Identity Endpoints — User Profile

Bounded context: Identity
Owns: UserProfile

Endpoints:
- GET /users/me — Get current user profile
- PUT /users/me — Update user profile
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.domain.models import UserPreferences, UserProfile
from app.infra.store import utc_now
from app.providers.base import AuthenticatedUser
from app.repositories import user_repository

router = APIRouter()


class UpdateUserRequest(BaseModel):
    displayName: str | None = None
    preferences: dict | None = None


def _get_or_create_profile(user: AuthenticatedUser) -> UserProfile:
    profile = user_repository.get_by_id(user.user_id)
    if profile:
        return profile

    profile = UserProfile(
        id=user.user_id,
        email=user.email,
        display_name=user.display_name,
        created_at=utc_now(),
    )
    return user_repository.create(profile)


def _serialize_profile(profile: UserProfile) -> dict:
    return {
        "id": profile.id,
        "email": profile.email,
        "displayName": profile.display_name,
        "createdAt": profile.created_at.isoformat(),
        "preferences": profile.preferences.model_dump(mode="json"),
        "usage": profile.usage.model_dump(mode="json"),
    }


@router.get("/me")
async def get_current_user_profile(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get or create the authenticated user's persisted profile."""
    profile = _get_or_create_profile(user)
    return {"user": _serialize_profile(profile)}


@router.put("/me")
async def update_user_profile(
    request: UpdateUserRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update the authenticated user's persisted profile."""
    profile = _get_or_create_profile(user)

    if request.displayName is not None:
        display_name = request.displayName.strip()
        if display_name:
            profile.display_name = display_name

    if request.preferences is not None:
        merged_preferences = {
            **profile.preferences.model_dump(mode="json"),
            **request.preferences,
        }
        profile.preferences = UserPreferences.model_validate(merged_preferences)

    profile = user_repository.update(profile)
    return {"user": _serialize_profile(profile)}
