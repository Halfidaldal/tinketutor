# TinkeTutor v2 — Revised Implementation Plan

> **Product:** TinkeTutor
> **Date:** 2026-04-11 (Revised)
> **Status:** Awaiting approval

---

## Revised Recommendation: Option 2 — Build on Educational AI

### What The Audit Found

The deep audit **changed my original assumption**. The Educational AI services are **not stubs** — they're substantially implemented:

| Service | Lines | Assessment |
|---|---|---|
| tutor_service.py | 751 | **Complete.** Full state machine (IDLE→CLARIFY→HINT_1→HINT_2→EVIDENCE→SELF_EXPLAIN→DIRECT_ANSWER), bilingual DA/EN, escalation system, evidence grounding, citation snapshot. This is production-quality pedagogical logic. |
| canvas_service.py | 1032 | **Complete.** Phrase extraction, concept derivation, evidence grounding, edge detection with 11 relation patterns, position layout, skeleton node generation with guiding questions. |
| quiz_service.py | 433 | **Complete.** MCQ + open-ended generation from evidence, LLM-based answer evaluation with rubric, concept matching, citation linkage. |
| search_service.py | 416 | **Complete.** Hybrid lexical+vector retrieval, RRF fusion, bilingual stopwords, traceability validation, grounding assessment. |
| source_processing_service.py | 157 | **Complete.** 5-stage pipeline: materialize→parse→chunk→embed→anchor. Progress tracking, error recovery. |
| gap_service.py | ~500 (est.) | **Implemented.** Three-signal analysis from canvas + quiz + unused chunks. |
| citation_service.py | ~200 (est.) | **Implemented.** Traceability validation, output citation creation. |

### The Data Layer Reality

The **critical finding**: The data layer uses an **in-memory JSON-file store** (store.py) that mimics Firestore's collection structure. It has 15 collections (notebooks, sources, chunks, citations, citation_anchors, processing_jobs, tutor_sessions, tutor_turns, concept_maps, concept_nodes, concept_edges, quiz_items, quiz_attempts, gap_reports, gap_findings) with JSON persistence to .local_data/.

This is **not broken** — it's a deliberate local-dev strategy. The repository layer uses these stores through clean repository interfaces. The path to real Firestore is mechanical: swap store.py for Firestore SDK calls, the service layer doesn't change.

### The Infrastructure State

| Layer | State | Assessment |
|---|---|---|
| **Vertex provider** | Implemented (114 lines) | generate(), stream_generate(), embed() all implemented against real Vertex SDK |
| **Provider factory** | Working | Routes to Vertex or OpenAI based on config |
| **Parser** | Local implementation (8262 lines) | Full PDF/PPTX/DOCX parsing with page tracking |
| **Frontend** | 13 components in 9 directories | CanvasView, CanvasNode, TutorPanel, TutorMessage, QuizCard, GapCard, CitationBadge, SourceCard, EvidencePanel, etc. |
| **Firebase Auth** | Implemented | FirebaseAuthProvider with token verification |

### Why This Changes The Recommendation

The Educational AI isn't a "shaky foundation with broken features" — it's a **substantially complete system** that was built with a local-dev-first data layer (JSON files instead of Firestore) and hasn't been **validated end-to-end** yet. That's a very different situation from "broken services."

Building on this gives us:
1. **~3000+ lines of pedagogical service logic** already written and aligned with the v2 product contract
2. **Correct domain model** (16 entities vs Open Notebook's 4)
3. **Correct architecture** (no SurrealDB migration needed)
4. **Working local parser** (handles PDF, PPTX, DOCX — the v2 file types)
5. **Bilingual tutor logic** already built into tutor_service.py (Danish + English)

What Open Notebook adds vs what we already have:
- Content extraction: **Educational AI has its own parser** (local_parser.py, 8262 lines)
- Embedding: **Educational AI has embedding pipeline** via Vertex
- Model abstraction: **Educational AI has provider factory** with Vertex/OpenAI

The main gap is: **we need to validate it all works together, then apply the TinkeTutor identity.**

---

## User Review Required

> [!IMPORTANT]
> **Validation-First Strategy**
> Before any identity or feature work, Phase 1 starts by running the Educational AI backend and frontend locally to confirm what works end-to-end. Any broken flows get fixed before we layer the TinkeTutor identity on top. This de-risks the foundation before we commit to it.

> [!WARNING]
> **Open Notebook Code Becomes Reference Only**
> The Open Notebook fork stays in the repo as tinketutor/legacy/ for reference, but we don't transplant components from it. The Educational AI already has equivalent implementations for content extraction, embedding, and retrieval. If specific Open Notebook utilities prove superior during development, we can selectively adopt them.

---

## Phase 1 — Validate Foundation & Rebrand (Week 1)

**Goal:** Confirm the Educational AI works locally end-to-end, then apply TinkeTutor identity.

---

### Step 1.1: Local Validation Sprint

Run the backend and frontend locally. Walk through each critical path:

| Test | Pass Criteria |
|---|---|
| Backend starts | uvicorn starts without import errors |
| Source upload + processing | Upload PDF → parser extracts → chunks created → anchors built |
| Retrieval | Query against chunked source → returns ranked evidence with citations |
| Tutor session | Start session → get grounded response with evidence references |
| Canvas generation | Generate concept map → nodes with citations, edges with relations |
| Quiz generation | Generate quiz from evidence → MCQ + open-ended items with citations |
| Frontend renders | Next.js app loads, all component pages render without errors |

**Fix anything that fails at this step.** This is our foundation audit — it must pass before we proceed.

---

### Step 1.2: Project Structure — Copy & Rename

#### [NEW] tinketutor/apps/api/ — TinkeTutor Backend
- Copy Educational_AI/apps/api/ into the TinkeTutor working directory
- This becomes the canonical backend

#### [NEW] tinketutor/apps/web/ — TinkeTutor Frontend
- Copy Educational_AI/apps/web/ into the TinkeTutor working directory
- This becomes the canonical frontend

#### [MOVE] tinketutor/open_notebook/ → tinketutor/legacy/
- Rename for clarity — this is reference code, not the active codebase

---

### Step 1.3: Identity Rename

#### [MODIFY] All user-facing copy
- Replace "Synthesis Studio" / "Synthesis Canvas" with "TinkeTutor" / "Knowledge Map"
- Update package.json, README.md, page titles, navigation labels
- No internal API naming changes (keep notebook_id, concept_map, etc. in code)

---

### Step 1.4: Danish-First Locale Foundation

#### [NEW] apps/web/lib/i18n/ — Locale system
- Simple JSON-based locale system (no heavyweight library needed for MVP)
- da.json — Danish strings for tutor-visible surfaces
- en.json — English fallback
- Locale context provider wrapping the app

#### [MODIFY] apps/api/app/config.py
- Add DEFAULT_LOCALE = "da", SUPPORTED_LOCALES = ["da", "en"]

The tutor service **already has Danish support** built in (lines 54-77 of tutor_service.py). We just need to wire the frontend locale selection to use it.

---

### Step 1.5: Vertex Runtime Configuration

#### [MODIFY] apps/api/app/config.py
- Add explicit role-based model routing:
  - VERTEX_MODEL_TUTOR = "gemini-2.0-flash" (streaming, low latency)
  - VERTEX_MODEL_STRUCTURED = "gemini-2.0-pro" (quiz gen, canvas gen, gap analysis)
  - VERTEX_EMBEDDING = "text-embedding-005"

#### [MODIFY] apps/api/app/providers/factory.py
- get_llm_provider(role="tutor") vs get_llm_provider(role="structured")
- Tutor uses Flash, structured tasks use Pro

---

## Phase 2 — Tutor-First Shell (Week 2)

**Goal:** The tutor is the front door. User meets TinkeTutor before anything else.

---

### Step 2.1: Application Shell

#### [MODIFY] apps/web/app/layout.tsx + new shell component
- Implement tutor-first layout:
  - **Persistent tutor panel** (primary, left/center)
  - **Collapsible workspace panel** (secondary, right)
  - Tutor context bar: active study space, source count, study progress
  - No blank workspace or generic notebook grid as entry

#### [MODIFY] apps/web/app/page.tsx (or dashboard equivalent)
- New user → Tutor introduces itself, guides first source upload
- Returning user → Tutor summarizes recent activity, suggests next action
- All interactions begin with the tutor, never with a generic UI

---

### Step 2.2: Tutor Components

#### [MODIFY] apps/web/components/tutor/TutorPanel.tsx
- Make tutor always visible (not a dismissible sidebar)
- Add mode indicators: onboarding, studying, reviewing, remediating
- Streaming response UI with inline citation badges

#### [MODIFY] apps/web/components/tutor/TutorMessage.tsx
- Add suggested_next_action display after each tutor response
- Citation badges link to source popovers
- Escalation buttons: "More help", "Show the source", "Give me the answer"

---

### Step 2.3: Tutor Orchestration Enhancements

#### [MODIFY] apps/api/app/services/tutor_service.py
- Add explicit mode enumeration beyond the existing state machine:
  - ONBOARDING — first-time user, no sources yet
  - STUDYING — normal study loop
  - REVIEWING — post-quiz analysis
  - REMEDIATING — gap-driven follow-up
- Each response includes suggested_next_action (already in the schema, needs consistent population)
- Enforce: "probe before explaining" when appropriate (the service already does this via hint levels)

---

## Phase 3 — Workspace as Support Surface (Weeks 3–4)

**Goal:** Sources, Knowledge Map, and citations feel subordinate to the tutor.

---

### Step 3.1: Source Library

#### [MODIFY] apps/web/components/sources/SourceCard.tsx
- Reframe visible UI as "Study Materials"
- Source upload triggered from tutor: "Upload your materials to get started"
- Processing progress visible inline
- Show: title, chunk count, citation usage count

---

### Step 3.2: Knowledge Map (formerly Canvas)

#### [MODIFY] apps/web/components/canvas/CanvasView.tsx
- Rename visible UI from "Canvas" to "Knowledge Map"
- Map generation triggered by tutor action, not standalone button
- Skeleton nodes with guiding questions (already implemented in canvas_service.py lines 383-417)
- Citation badges on all nodes (already in the service layer)

---

### Step 3.3: Citations

#### [MODIFY] apps/web/components/citations/CitationBadge.tsx
- Citation popover: source title, page number, section title, snippet text
- Clickable from tutor messages, map nodes, quiz explanations, gap findings
- UI locale separated from source excerpt language

---

## Phase 4 — Quiz and Gap Through the Tutor (Weeks 5–6)

**Goal:** Assessment and remediation feel like tutor actions, not standalone features.

---

### Step 4.1: Quiz via Tutor

#### [MODIFY] apps/web/components/quiz/QuizCard.tsx
- Quiz initiated by tutor: "Let's test what you know about X"
- Results reviewed by tutor with citations
- No standalone quiz dashboard — tutor mediates everything

#### quiz_service.py is already well-implemented — the main work is frontend integration with the tutor flow.

---

### Step 4.2: Gap Analysis via Tutor

#### [MODIFY] apps/web/components/gaps/GapCard.tsx
- Gap results presented through tutor voice
- "I've found areas you should revisit" → prioritized gap list
- One-click "Study this topic" routes back to tutor study loop

---

## Phase 5 — Hardening & Deployment (Weeks 7–8)

**Goal:** Production readiness. Clean deployment. Full locale coverage.

---

### Step 5.1: Data Layer Production Path

#### [MODIFY] apps/api/app/infra/store.py
- Option A: Keep JSON file store for MVP, add Firestore migration path for post-launch
- Option B: Replace with real Firestore calls now (the repository interfaces are clean, making this a bounded task)
- **Recommend Option A** to keep velocity high, then migrate post-validation

### Step 5.2: Naming Cleanup

- Audit all user-visible strings for remnant "Synthesis Studio" / "Open Notebook"
- Update CLAUDE.md, AGENTS.md, README.md

### Step 5.3: Locale QA

- Full DA/EN string coverage audit
- Verify tutor defaults to Danish when locale == "da"
- Citation UI separates ui_locale from source_locale

### Step 5.4: Deployment

- Vercel (frontend) + Cloud Run (backend) + Firebase Auth
- Confirm EU data residency (europe-west1)
- Validate Firebase Auth domain authorization with Vercel preview URLs
