"""
Mindmap API Endpoint

POST /notebooks/{notebook_id}/mindmap — Generate a hierarchical knowledge tree
GET  /notebooks/{notebook_id}/mindmap  — (future) Retrieve cached mindmap
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, get_mindmap_llm
from app.domain.exceptions import SynthesisStudioError
from app.providers.base import AuthenticatedUser, LLMProvider
from app.services import mindmap_service

router = APIRouter()


def _raise_from_domain_error(error: Exception) -> None:
    if isinstance(error, SynthesisStudioError):
        if error.code == "NOT_FOUND":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=error.message) from error
        if error.code == "FORBIDDEN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error.message) from error
        if error.code == "VALIDATION_ERROR":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
        if error.code == "PROVIDER_ERROR":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    raise error


@router.post("/{notebook_id}/mindmap", status_code=status.HTTP_200_OK)
async def generate_mindmap(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    llm: LLMProvider = Depends(get_mindmap_llm),
) -> dict[str, Any]:
    """
    Generate a hierarchical knowledge mindmap tree for all sources in a notebook.

    Returns a recursive JSON tree:
    {
        "title": "Root Topic",
        "nodes": [
            {
                "id": "n1",
                "label": "Theme",
                "summary": "...",
                "guiding_question": "...",
                "children": [...]
            }
        ]
    }
    """
    try:
        tree = await mindmap_service.generate_mindmap(
            notebook_id=notebook_id,
            user_id=user.user_id,
            llm=llm,
        )
    except Exception as error:
        _raise_from_domain_error(error)

    return tree
