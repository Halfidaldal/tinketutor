# Copilot Instructions — Synthesis Studio

## Build, test, and lint commands

Prefer the root `Makefile` targets; they match CI/local expectations.

```bash
# Install dependencies
make setup

# Run local runtime (use separate terminals)
make emulators
make dev-backend
make dev-frontend

# Backend tests
make test-backend
make acceptance-backend

# Run a single backend test
cd apps/api && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_auth.py::test_protected_endpoint_requires_bearer_token

# Frontend checks
make lint-frontend
make build-frontend

# Full local acceptance gate
make acceptance
```

## High-level architecture

- Monorepo with:
  - `apps/web`: Next.js App Router frontend (Next 16 / React 19), Firebase Auth client, workspace UI.
  - `apps/api`: FastAPI backend with bounded-context routers under `/api/v1`.
  - `docs/`: binding product + architecture contracts (Phase 1/2 docs).
- Auth flow is Firebase end-to-end:
  - Frontend gets Firebase ID tokens (`apps/web/lib/firebase.ts`).
  - API client attaches `Authorization: Bearer <token>` (`apps/web/lib/api.ts`).
  - Backend validates tokens via `get_current_user()` and `AuthProvider` (`apps/api/app/dependencies.py`).
- Persistence and runtime state are Firebase-backed:
  - Firestore for domain entities + jobs, Cloud Storage for uploads (`apps/api/app/infra/firestore.py`, `apps/api/app/infra/storage.py`).
  - Local development expects Firebase emulators (auth/firestore/storage).
- Retrieval/generation pipeline:
  - Source upload creates source + processing job, then async processing dispatches background work (`sources.py`, `infra/tasks.py`).
  - Retrieval builds notebook-scoped `EvidencePack` with traceability/citation-anchor checks (`services/search_service.py`).
  - Canvas, tutor, quiz, and gap flows consume grounded evidence and persist outputs to notebook subcollections.
- Async product flows use a job pattern:
  - Endpoints return `{ jobId }`, frontend polls `/api/v1/jobs/{jobId}` (see quiz/gaps pages and `api.jobs.get`).

## Key conventions for this codebase

- Keep backend seams intact:
  - Service code should use provider interfaces (`LLMProvider`, `ParserProvider`, `VectorStore`, `ObjectStore`, `AuthProvider`) via dependencies/factory.
  - Do not import vendor SDKs directly in services.
- Keep prompts separate from business logic:
  - Prompt templates belong in `apps/api/app/prompts/`, not inside services/providers.
- Enforce notebook-scoped grounding:
  - Retrieval and generation must stay scoped to notebook/source IDs and preserve citation traceability semantics (`supported` vs `insufficient_grounding` etc.).
- Use the centralized frontend API client:
  - Add/update backend calls in `apps/web/lib/api.ts` rather than ad hoc `fetch` usage in components/pages.
  - `NEXT_PUBLIC_API_URL` must include `/api/v1` (required contract).
- Workspace pages should share state through `useWorkspace()` from `app/workspace/[notebookId]/layout.tsx` instead of duplicating notebook/source/concept-map fetch logic.
- API route shape and compatibility matter:
  - Existing aliases (e.g., `/turns` and `/messages` for tutor continuation, `/concept-maps` and `/generate-canvas`) are intentionally kept for client compatibility.
- Follow the existing Next.js rule in `apps/web/CLAUDE.md`:
  - This repo uses a newer Next.js line with breaking changes; prefer current version docs before framework-level edits.

## MCP server guidance (Playwright)

- Use Playwright MCP for end-to-end verification of the real learning loop in `apps/web`: sign-in, notebook creation, source upload, canvas generation, quiz generation/submission, and gap analysis.
- Start the full local stack before Playwright-driven checks:
  - `make emulators`
  - `make dev-backend`
  - `make dev-frontend`
- Prefer stable selectors already present in the UI:
  - `#btn-create-notebook`, `#btn-generate-canvas`, and workspace tab ids like `#tab-sources`, `#tab-canvas`, `#tab-tutor`, `#tab-quiz`, `#tab-gaps`.
- Account for async job behavior in UI tests:
  - source processing, quiz generation, and gap analysis are job-based; wait for status/progress transitions instead of assuming immediate completion.
