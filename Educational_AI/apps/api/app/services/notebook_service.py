"""
Notebook Service — CRUD operations for notebooks.

Bounded context: SynthesisWorkspace
Owns: Notebook entity
"""

from app.domain.enums import NotebookStatus
from app.domain.models import Notebook
from app.infra.store import new_id, utc_now
from app.repositories import notebook_repository


def create_notebook(user_id: str, title: str, description: str = "") -> dict:
    """Create a new notebook owned by user_id."""
    now = utc_now()
    notebook = Notebook(
        id=new_id(),
        user_id=user_id,
        title=title.strip(),
        description=description.strip(),
        source_ids=[],
        status=NotebookStatus.ACTIVE,
        created_at=now,
        updated_at=now,
    )
    saved = notebook_repository.create(notebook)
    return saved.model_dump(mode="json")


def list_notebooks(user_id: str) -> list[dict]:
    """Return all notebooks owned by user_id, newest first."""
    return [
        notebook.model_dump(mode="json")
        for notebook in notebook_repository.list_by_user(user_id)
    ]


def get_notebook(notebook_id: str, user_id: str) -> dict | None:
    """Get a single notebook. Returns None if not found or not owned."""
    notebook = notebook_repository.get_by_id(notebook_id)
    if notebook and notebook.user_id == user_id:
        return notebook.model_dump(mode="json")
    return None


def update_notebook(
    notebook_id: str,
    user_id: str,
    title: str | None = None,
    description: str | None = None,
) -> dict | None:
    """Update notebook metadata. Returns updated doc or None if not found."""
    notebook = notebook_repository.get_by_id(notebook_id)
    if not notebook or notebook.user_id != user_id:
        return None
    if title is not None:
        notebook.title = title.strip()
    if description is not None:
        notebook.description = description.strip()
    notebook.updated_at = utc_now()
    saved = notebook_repository.update(notebook)
    return saved.model_dump(mode="json")


def delete_notebook(notebook_id: str, user_id: str) -> bool:
    """Delete a notebook. Returns True if deleted, False if not found."""
    notebook = notebook_repository.get_by_id(notebook_id)
    if not notebook or notebook.user_id != user_id:
        return False
    notebook_repository.delete(notebook_id)
    # TODO: [Phase 5] Cascade delete sources, chunks, nodes, edges, etc.
    return True


def add_source_to_notebook(notebook_id: str, source_id: str) -> None:
    """Track a source ID in the notebook's source_ids list."""
    notebook = notebook_repository.get_by_id(notebook_id)
    if notebook and source_id not in notebook.source_ids:
        notebook.source_ids.append(source_id)
        notebook.updated_at = utc_now()
        notebook_repository.update(notebook)


def remove_source_from_notebook(notebook_id: str, source_id: str) -> None:
    """Remove a source ID from a notebook when the source is deleted."""
    notebook = notebook_repository.get_by_id(notebook_id)
    if notebook and source_id in notebook.source_ids:
        notebook.source_ids = [existing for existing in notebook.source_ids if existing != source_id]
        notebook.updated_at = utc_now()
        notebook_repository.update(notebook)
