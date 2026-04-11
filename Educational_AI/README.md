# Synthesis Studio

> AI-powered educational workspace — source-grounded active learning

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud SDK (for LLM provider access)

### 1. Clone and Install

```bash
# Frontend
cd apps/web
npm install

# Backend
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Firebase project values
# For local development, keep the emulator hosts enabled.

# Frontend
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your Firebase web-app config
```

### 3. Start Firebase Emulator Suite

Local development now assumes real Firebase-backed runtime state:
- Firebase Auth for login
- Firestore for notebook, source, retrieval, tutor, quiz, gap, and canvas state
- Cloud Storage for uploaded source files

The previous JSON/file-backed runtime path is no longer the normal development path.

```bash
firebase emulators:start
```

### 4. Run Development Servers

```bash
# Terminal 1 — Backend API
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd apps/web
npm run dev
```

### 5. Verify

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/api/docs
- Health check: http://localhost:8000/api/v1/health
- Firebase Emulator UI: http://localhost:4000

## Project Structure

```
synthesis-studio/
├── apps/
│   ├── web/              # Next.js 14+ frontend (TypeScript, Tailwind)
│   └── api/              # FastAPI backend (Python 3.11+)
├── packages/
│   ├── types/            # Shared TypeScript types (domain + API contracts)
│   ├── prompts/          # Reserved: prompt template exports
│   ├── clients/          # Reserved: provider adapter clients
│   ├── core/             # Reserved: core domain logic
│   └── ui/               # Reserved: shared UI components
├── infrastructure/       # Firebase + Cloud Run deployment configs
├── docs/                 # Architecture documents (governing specs)
└── .github/              # CI/CD workflows
```

## Architecture

See `docs/` for the full architecture documentation:

- **Phase 0**: Master Implementation Brief + Executive Summary
- **Phase 1**: V1 Product Contract + Checklist
- **Phase 2**: Technical Architecture Pack + System Contracts + Implementation Seams

## Bounded Contexts

| Context | Responsibility |
|---|---|
| **SourceIngestion** | Upload, parse, chunk, embed documents |
| **KnowledgeRetrieval** | Notebook-scoped semantic search, citation resolution |
| **ActiveLearning** | Socratic tutor, quiz engine, gap analysis |
| **SynthesisWorkspace** | Canvas state, notebooks, nodes, edges |
| **Identity** | Auth (Firebase), user profiles |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| Auth | Firebase Auth |
| Database | Firestore |
| Storage | Cloud Storage |
| LLM | Gemini (via provider abstraction) |
| Deployment | Cloud Run + Firebase Hosting |

## Status

**Foundation closure in progress.** Auth and durable Firebase-backed state now target the local emulator suite rather than JSON/local-file runtime scaffolding.
