# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This is an umbrella repo containing two active projects:

```
TinkeTutor/
├── Educational_AI/          # Synthesis Studio — Firebase-backed educational workspace
│   ├── apps/
│   │   ├── web/             # Next.js frontend (TypeScript, Tailwind)
│   │   └── api/             # FastAPI backend (Python 3.11+)
│   └── packages/            # Shared types, clients, UI (mostly reserved stubs)
│
└── tinketutor/              # Open Notebook fork — self-hosted AI research assistant
    ├── apps/
    │   └── web/             # TinkeTutor Next.js shell (Phase 1 rebrand)
    ├── frontend/            # Original Open Notebook frontend (Next.js)
    ├── api/                 # Open Notebook FastAPI backend
    └── open_notebook/       # Core backend logic (LangGraph, SurrealDB)
```

Most active development is in **`Educational_AI/`** (Synthesis Studio / TinkeTutor). The `tinketutor/` subtree is the upstream Open Notebook project with a TinkeTutor shell layered on top.

---

## Educational_AI — Synthesis Studio

### Architecture

```
Next.js frontend (port 3000)
        │  HTTP + Firebase ID token (Bearer)
FastAPI backend (port 8000)
        │  Firebase Admin SDK
Firebase (Auth · Firestore · Cloud Storage)
```

All backend routes live under `/api/v1/`. Firebase Auth ID tokens are attached by the frontend via `getCurrentIdToken()` and verified by the API's auth middleware.

### Bounded Contexts

| Context | Responsibility |
|---|---|
| **SourceIngestion** | Upload, parse, chunk, embed documents |
| **KnowledgeRetrieval** | Notebook-scoped semantic search, citation resolution |
| **ActiveLearning** | Socratic tutor (`/tutor/`), quiz engine, gap analysis |
| **SynthesisWorkspace** | Canvas state, concept maps, notebooks, nodes/edges |
| **Identity** | Firebase Auth, user profiles |

### Development Commands

```bash
# 1. Start Firebase emulators (Auth + Firestore + Storage)
firebase emulators:start

# 2. Backend
cd Educational_AI/apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd Educational_AI/apps/web
npm install
npm run dev          # http://localhost:3000

# Validate (same checks as Phase 1 gate)
npm run lint
npm run build
```

### Frontend: `Educational_AI/apps/web/`

- **Framework**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Auth**: Firebase Auth via `lib/firebase.ts` + `lib/hooks.ts` (`AuthProvider`, `useAuth`, `useRequireAuth`)
- **API client**: `lib/api.ts` — single `api` object grouped by context (`api.sources.*`, `api.tutor.*`, `api.quiz.*`, etc.). Uses `getCurrentIdToken()` to attach `Authorization: Bearer` header automatically.
- **i18n**: Danish-first. All user-visible strings go in `lib/i18n/da.json` and `lib/i18n/en.json`. Client components read via `useI18n()`. **Never hardcode UI strings.**
- **Tests**: `node --import tsx --test lib/*.test.ts` (run via `npm test`)

#### Workspace Shell

`app/workspace/[notebookId]/layout.tsx` is the core layout. It:
- Owns `WorkspaceContext` (notebook, sources, concept map nodes/edges, focus/selection state)
- Polls for source processing status every 1.5 s when sources are active
- Renders a split-pane: **TutorPanel** (left, 45%) + **workspace tabs** (right)
- Workspace tabs: Sources → Canvas (Knowledge Map) → Quiz → Gaps

`WorkspaceFocus` (from `lib/workspace-focus.ts`) tracks the currently focused node/edge and syncs with `CanvasSelectionContext`. Always call `syncWorkspaceFocusWithGraph` when nodes/edges change.

#### Emulator Setup

`lib/firebase.ts` auto-connects to Firebase emulators when `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true`. The required env vars are declared in `REQUIRED_FIREBASE_PUBLIC_ENV` — the app throws at init if any are missing.

### Backend: `Educational_AI/apps/api/`

- **Entry**: `app/main.py` — FastAPI, CORS from `settings.cors_origins`, all routes under `/api/v1/`
- **Router**: `app/api/v1/router.py`
- **Config**: `app/config.py` (`settings` object via Pydantic)
- **Firestore**: `app/infra/firestore.py`
- **Tests**: `pytest` (asyncio_mode = auto), test files in `tests/`

```bash
cd Educational_AI/apps/api
pytest tests/
```

### Environment Variables

**Frontend** (`Educational_AI/apps/web/.env.local`):
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true        # local dev
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

**Backend** (`Educational_AI/apps/api/.env`): Firebase project values + Google Cloud credentials.

---

## tinketutor/ — Open Notebook Fork

The `tinketutor/apps/web/` directory is a TinkeTutor Phase 1 shell on top of Open Notebook. See `tinketutor/CLAUDE.md` for the full upstream architecture guide.

### TinkeTutor Web Shell Commands

```bash
cd tinketutor/apps/web
npm run dev     # Next.js dev server
npm run build   # Production build
npm run lint    # ESLint
npm test        # node --import tsx --test lib/*.test.ts
```

**Note**: `tinketutor/apps/web/AGENTS.md` warns that this Next.js version has breaking API changes. Read `node_modules/next/dist/docs/` before writing Next.js code here.

### Scope Notes

Phase 1 rebrands the visible shell to TinkeTutor/Knowledge Map without renaming internal `canvas_*`, notebook, or route symbols. Locale files are at `lib/i18n/da.json` and `lib/i18n/en.json`.

---

## Cross-Cutting Rules

- **Danish-first**: All user-facing copy must have a Danish (`da`) key. English (`en`) is secondary.
- **i18n**: Never hardcode user-visible strings — always use `useI18n()` / `t('key')`.
- **Auth tokens**: The frontend fetches a Firebase ID token before every API call. Never bypass this — the API validates it server-side.
- **API base fallback**: In dev, `lib/api.ts` falls back to `http://localhost:5055/api/v1` if `NEXT_PUBLIC_API_URL` is unset (note: Open Notebook API port); for production the env var is required.
