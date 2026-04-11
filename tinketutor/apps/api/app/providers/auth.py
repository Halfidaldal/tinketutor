"""
Seam 5: AuthProvider — Abstract Base Class

File: backend/app/providers/auth.py
Per phase-2-implementation-seams.md §Seam 5:

Firebase Auth will eventually be supplemented with UNI-Login SAML.
The auth middleware must accept any OIDC token.

Implementations:
- FirebaseAuthProvider (v1)
- Future: UNILoginAuthProvider (Phase 3 institutional)
"""

from abc import ABC, abstractmethod

from app.providers.base import AuthenticatedUser


class AuthProvider(ABC):
    """
    Abstract authentication provider interface.

    Per ADR-8: The auth middleware accepts any OIDC token,
    making future SSO integration a configuration change.
    """

    @abstractmethod
    async def verify_token(self, token: str) -> AuthenticatedUser:
        """
        Verify an authentication token and return the user.

        Args:
            token: The bearer token (Firebase ID token in v1)

        Returns:
            AuthenticatedUser with user_id, email, display_name

        Raises:
            HTTPException(401) if token is invalid
        """
        ...
