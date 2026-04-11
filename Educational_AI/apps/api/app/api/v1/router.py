"""
API v1 Router — aggregates all endpoint groups.

Groups aligned to bounded contexts (phase-2-system-contracts.md):
- SourceIngestion: sources
- KnowledgeRetrieval: search, citations
- SynthesisWorkspace: notebooks (includes nodes, edges, canvas generation)
- ActiveLearning: tutor, quizzes, gaps
- Cross-cutting: jobs, users
"""

from fastapi import APIRouter

from app.api.v1.sources import router as sources_router
from app.api.v1.search import router as search_router
from app.api.v1.notebooks import router as notebooks_router
from app.api.v1.concept_maps import router as concept_maps_router
from app.api.v1.tutor import router as tutor_router
from app.api.v1.quizzes import router as quizzes_router
from app.api.v1.gaps import router as gaps_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.users import router as users_router

api_v1_router = APIRouter()

# --- SourceIngestion context ---
api_v1_router.include_router(sources_router, prefix="/sources", tags=["Sources"])

# --- KnowledgeRetrieval context ---
api_v1_router.include_router(search_router, tags=["Search"])

# --- SynthesisWorkspace context ---
api_v1_router.include_router(notebooks_router, prefix="/notebooks", tags=["Notebooks"])
api_v1_router.include_router(concept_maps_router, prefix="/notebooks", tags=["Concept Maps"])

# --- ActiveLearning context: Tutor ---
api_v1_router.include_router(tutor_router, prefix="/notebooks", tags=["Tutor"])

# --- ActiveLearning context: Quizzes ---
api_v1_router.include_router(quizzes_router, prefix="/notebooks", tags=["Quizzes"])

# --- ActiveLearning context: Gap Hunter ---
api_v1_router.include_router(gaps_router, prefix="/notebooks", tags=["Gaps"])

# --- Cross-cutting: Jobs ---
api_v1_router.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])

# --- Identity context: Users ---
api_v1_router.include_router(users_router, prefix="/users", tags=["Users"])
