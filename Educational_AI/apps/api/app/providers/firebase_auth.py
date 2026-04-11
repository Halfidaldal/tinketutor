"""
Firebase-backed authentication provider.

Keeps Firebase Admin token verification behind the generic AuthProvider seam so
the rest of the backend only deals with AuthenticatedUser.
"""

from __future__ import annotations

import asyncio

from fastapi import HTTPException, status
from firebase_admin import auth

from app.providers.auth import AuthProvider
from app.providers.base import AuthenticatedUser
from app.infra.firestore import initialize_firebase


class FirebaseAuthProvider(AuthProvider):
    """Verify Firebase ID tokens and expose a generic authenticated user."""

    def __init__(self) -> None:
        initialize_firebase()

    async def verify_token(self, token: str) -> AuthenticatedUser:
        try:
            decoded = await asyncio.to_thread(auth.verify_id_token, token)
        except Exception as exc:  # pragma: no cover - defensive fallback around SDK variance
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
            ) from exc

        user_id = decoded.get("uid") or decoded.get("user_id") or decoded.get("sub")
        email = decoded.get("email")
        display_name = decoded.get("name") or decoded.get("display_name") or ""

        if not user_id or not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token is missing required identity claims",
            )

        if not display_name and email:
            display_name = email.split("@", 1)[0]

        return AuthenticatedUser(
            user_id=user_id,
            email=email,
            display_name=display_name,
        )
