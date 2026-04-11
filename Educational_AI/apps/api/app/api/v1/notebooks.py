"""
SynthesisWorkspace notebook endpoints.

Owns notebook CRUD and the notebook-detail payload consumed by the workspace shell.
Concept-map generation and element editing live in the dedicated concept-map router.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.providers.base import AuthenticatedUser
from app.services import canvas_service, notebook_service, source_service


router = APIRouter()


class CreateNotebookRequest(BaseModel):
    title: str
    description: str = ""


class UpdateNotebookRequest(BaseModel):
    title: str | None = None
    description: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_notebook(
    request: CreateNotebookRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    if not request.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Notebook title is required",
        )

    notebook = notebook_service.create_notebook(
        user_id=user.user_id,
        title=request.title,
        description=request.description,
    )
    return {"notebook": notebook}


@router.get("")
async def list_notebooks(
    user: AuthenticatedUser = Depends(get_current_user),
):
    return {"notebooks": notebook_service.list_notebooks(user.user_id)}


@router.get("/{notebook_id}")
async def get_notebook(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    notebook = notebook_service.get_notebook(notebook_id, user.user_id)
    if not notebook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )

    sources = source_service.list_sources(notebook_id, user.user_id)
    concept_map, nodes, edges = canvas_service.get_latest_concept_map(
        notebook_id=notebook_id,
        user_id=user.user_id,
    )
    return {
        "notebook": notebook,
        "sources": sources,
        "concept_map": concept_map.model_dump(mode="json") if concept_map else None,
        "nodes": [node.model_dump(mode="json") for node in nodes],
        "edges": [edge.model_dump(mode="json") for edge in edges],
    }


@router.put("/{notebook_id}")
async def update_notebook(
    notebook_id: str,
    request: UpdateNotebookRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    notebook = notebook_service.update_notebook(
        notebook_id=notebook_id,
        user_id=user.user_id,
        title=request.title,
        description=request.description,
    )
    if not notebook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )
    return {"notebook": notebook}


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(
    notebook_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    deleted = notebook_service.delete_notebook(notebook_id, user.user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )
    return None
