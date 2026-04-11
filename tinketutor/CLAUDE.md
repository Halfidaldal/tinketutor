# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
tinketutor/
├── apps/web/          # TinkeTutor shell — Firebase-auth Next.js frontend (PRIMARY)
├── frontend/          # Upstream Open Notebook frontend (Next.js, Zustand, Shadcn/ui)
├── api/               # Open Notebook FastAPI backend (port 5055)
└── open_notebook/     # Backend core: domain models, LangGraph graphs, SurrealDB
```

Active TinkeTutor development lives in `apps/web/`. The `frontend/` tree is the upstream Open Notebook UI; prefer editing `apps/web/` unless you are contributing back upstream.

---

## Development Commands

### TinkeTutor Web Shell (`apps/web/`)

```bash
cd apps/web
npm run dev          # Next.js dev server — http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm test             # node --import tsx --test lib/*.test.ts
```

> **AGENTS.md warning**: This Next.js version (16.x) has breaking API changes from earlier versions. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

### API Backend

```bash
# From repo root (uses uv)
uv run uvicorn api.main:app --host 0.0.0.0 --port 5055 --reload

# Run all backend tests
uv run pytest tests/
```

### Upstream Frontend (`frontend/`)

```bash
cd frontend
npm run dev          # http://localhost:3000
```

---

## Architecture

### Three-Tier (Upstream Open Notebook)

```
TinkeTutor Web Shell (apps/web/) — Firebase ID-token auth
         │  HTTP REST + Bearer token
Open Notebook API (api/ @ port 5055)
         │  SurrealQL
SurrealDB (graph database @ port 8000)
```

All backend REST routes are under `/api/v1/`. The API also uses a simple password middleware (dev-only); in `apps/web/` this is bypassed — Firebase ID tokens are used instead (see auth below).

### LangGraph Workflows (open_notebook/graphs/)

- **source.py**: Content ingestion (extract → embed → save)
- **chat.py**: Conversational agent with message history (SqliteSaver checkpoint)
- **ask.py**: Search + synthesis (retrieve → LLM)
- **transformation.py**: Custom transformations on sources

All use `provision_langchain_model()` for model selection. Graph state persists in `/data/sqlite-db/`.

### AI / Multi-Provider (open_notebook/ai/)

Esperanto library provides a unified interface to 8+ providers. `ModelManager` is a factory with fallback. Credentials are stored encrypted in SurrealDB (Fernet) and provisioned into env vars before model calls via `key_provider.py`.

### Database Migrations

`AsyncMigrationManager` runs automatically on API startup from `migrations/*.surql`. No manual steps required; check API logs for errors.

---

## TinkeTutor Web Shell (`apps/web/`)

### Key Files

| File | Role |
|---|---|
| `lib/firebase.ts` | Firebase init, emulator wiring, `getCurrentIdToken()` |
| `lib/hooks.ts` | `AuthProvider`, `useAuth`, `useRequireAuth`, `useRedirectAuthenticated` |
| `lib/api.ts` | Typed API client (`api.sources.*`, `api.tutor.*`, `api.quiz.*`, etc.) |
| `lib/concept-map.ts` | Shared DTO types for nodes, edges, and concept maps |
| `lib/tutor.ts` | Tutor session/turn types, `buildTutorMessageParts()`, citation parsing |
| `lib/workspace-focus.ts` | `WorkspaceFocus` union type, `syncWorkspaceFocusWithGraph()` |
| `lib/i18n/index.tsx` | `I18nProvider`, `useI18n()`, `t(key)` — Danish-first, English fallback |
| `app/workspace/[notebookId]/layout.tsx` | Core workspace shell — `WorkspaceContext`, polling, split-pane layout |

### Auth Flow

`lib/firebase.ts` auto-connects to Firebase emulators when `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true`. The app throws at init if any `REQUIRED_FIREBASE_PUBLIC_ENV` var is missing.

Every `apiFetch` call in `lib/api.ts` calls `getCurrentIdToken()` and attaches `Authorization: Bearer <id-token>`. Never bypass this — the FastAPI backend validates the Firebase ID token server-side.

### i18n Rules

- **Danish-first**: all user-visible strings must have a `da` key in `lib/i18n/da.json`
- English (`lib/i18n/en.json`) is the fallback
- Never hardcode UI strings — always use `t('key')` from `useI18n()`
- The locale is persisted to `localStorage` under `tinketutor.locale`

### WorkspaceContext

`app/workspace/[notebookId]/layout.tsx` owns the workspace state:
- Fetches notebook, sources, concept map on mount
- Polls every 1.5 s when any source has status `uploaded` or `processing`
- Renders **TutorPanel** (left, 45%) + tab-routed workspace pane (right)
- Workspace tabs: Sources → Canvas (Knowledge Map) → Quiz → Gaps

`WorkspaceFocus` tracks focused node, edge, or citation. Always call `syncWorkspaceFocusWithGraph` when nodes/edges change so the focus stays consistent with graph state.

### Environment Variables (apps/web/.env.local)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true   # local dev
NEXT_PUBLIC_API_URL=http://localhost:5055/api/v1
```

In production, `NEXT_PUBLIC_API_URL` is required. In dev, it falls back to `http://localhost:5055/api/v1`.

---

## Backend Quirks

- **Start order**: SurrealDB → API → frontend (API fails without database)
- **Migrations run on every startup**: No manual migration steps; check logs
- **PasswordAuthMiddleware is dev-only**: The API's built-in password auth is not used by `apps/web/`; `apps/web/` sends Firebase ID tokens instead
- **LangGraph workflows are blocking**: Chat/podcast may take minutes; no timeout
- **Podcast jobs are fire-and-forget**: Poll `/commands/{command_id}` for status
- **CORS is open in dev**: Restrict before production

## Detailed Component References

- `api/CLAUDE.md` — FastAPI structure, router/service pattern, error handling, credential management
- `open_notebook/CLAUDE.md` — Domain models, LangGraph workflows, AI provisioning
- `open_notebook/domain/CLAUDE.md` — SurrealDB repository pattern
- `open_notebook/ai/CLAUDE.md` — ModelManager, Esperanto, key_provider
- `open_notebook/graphs/CLAUDE.md` — LangGraph workflow design
- `open_notebook/database/CLAUDE.md` — SurrealDB async patterns, migrations
- `frontend/CLAUDE.md` — Upstream Open Notebook frontend (Zustand, TanStack Query)
