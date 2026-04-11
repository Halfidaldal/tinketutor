"""
Synthesis Studio — FastAPI Application Entry Point

This is the main FastAPI application. It configures:
- CORS middleware for the Next.js frontend
- API versioning under /api/v1/
- Health endpoint
- Auth middleware (Firebase ID token verification)

Governing docs:
- phase-2-technical-architecture-pack.md §3.2
- phase-2-system-contracts.md — API Groups
"""

from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.v1.router import api_v1_router
from app.infra.firestore import get_firestore_client

app = FastAPI(
    title="Synthesis Studio API",
    description="AI-powered educational workspace API — source-grounded active learning",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — explicit frontend origins only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount API v1 router
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health_check():
    """Liveness check. Confirms the process is serving requests."""
    return {
        "status": "healthy",
        "service": "synthesis-studio-api",
        "version": "0.1.0",
        "environment": settings.environment,
    }


@app.get("/api/v1/ready")
async def readiness_check():
    """
    Readiness check for deploy verification.

    A ready backend must have the required Firebase runtime configuration and
    be able to reach Firestore. This keeps the check lightweight while still
    validating the critical persistence dependency.
    """

    missing_config: list[str] = []
    if not (settings.firebase_project_id or settings.google_cloud_project):
        missing_config.append("FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT")
    if not settings.firebase_storage_bucket:
        missing_config.append("FIREBASE_STORAGE_BUCKET")

    firestore_error: str | None = None
    if not missing_config:
        try:
            await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: list(get_firestore_client().collection("healthcheck").limit(1).stream())
                ),
                timeout=5,
            )
        except Exception as exc:  # pragma: no cover - exercised by deploy/runtime smoke tests
            firestore_error = str(exc)

    checks = {
        "config": "ok" if not missing_config else "missing",
        "firestore": "ok" if firestore_error is None and not missing_config else "error",
    }
    payload = {
        "status": "ready" if not missing_config and firestore_error is None else "not_ready",
        "service": "synthesis-studio-api",
        "version": "0.1.0",
        "environment": settings.environment,
        "cors_origins": settings.cors_origins,
        "checks": checks,
        "missing_config": missing_config,
        "firestore_error": firestore_error,
    }

    if missing_config or firestore_error is not None:
        return JSONResponse(status_code=503, content=payload)

    return payload
