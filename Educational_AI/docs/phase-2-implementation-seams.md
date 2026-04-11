# Phase 2 — Implementation Seams

> **Historical v1 document.** This file describes the superseded v1 `Synthesis Studio` direction and is retained as a historical record. For the current product direction, use the v2 docs stack starting with [v2-master-brief.md](./v2-master-brief.md).

> **Purpose:** Guide implementation agents on what to build real, what to mock, and where abstraction seams must exist from day one.
> **Date:** 2026-04-07

---

## What Must Be Real First

These components must be implemented with real functionality from the earliest implementation phase. No mocking allowed.

| # | Component | Why |
|---|---|---|
| 1 | **Firebase Auth (Google + email sign-in)** | Every endpoint requires auth. Cannot be faked. |
| 2 | **PDF parsing via `unstructured`** | Demo depends on parsing real student materials. |
| 3 | **Semantic chunking with hierarchy metadata** | Chunk quality drives citations, canvas, tutor, quiz — everything. |
| 4 | **Embedding generation (real Gemini API call)** | Search correctness depends on real embeddings. |
| 5 | **Cosine similarity search (numpy)** | Retrieval accuracy is the foundation of citation trust. |
| 6 | **Citation service (creation + chunk_id validation)** | Core differentiator. Can never be faked. |
| 7 | **Canvas generation (real LLM call)** | The aha moment. Must be real to evaluate quality. |
| 8 | **Tutor streaming (real LLM call via SSE)** | Pedagogical restraint must be tested against real model output. |
| 9 | **Quiz generation (real LLM call)** | Questions must be grounded in actual source chunks. |
| 10 | **Firestore persistence for all domain entities** | Data must survive page refresh. |
| 11 | **User data isolation (security rules + backend validation)** | Must work before any external demo. |
| 12 | **EvidencePack assembly** | Shared contract between retrieval and all generation services. Must produce real data. |

---

## What Can Be Mocked Initially

These components can start as simplified implementations and be upgraded before demo/production.

| # | Component | Mock Strategy | When It Must Be Real |
|---|---|---|---|
| 1 | **Cloud Tasks (async job dispatch)** | Use `asyncio.create_task()` in-process. Background tasks run in the same uvicorn worker. | Before Phase 3 polish. Must be Cloud Tasks for prod reliability. |
| 2 | **OpenAI provider** | Stub `OpenAIProvider` that raises `NotImplementedError` or delegates to Gemini. | Before v2. Only Gemini needed for demo. |
| 3 | **PPTX/DOCX parsing** | Stub that returns error "Format not yet supported" if PDF works first. | End of Phase 1. Must work before demo. |
| 4 | **`.txt` file upload** | Skip entirely. | Add only if time permits. |
| 5 | **Firestore security rules** | Use permissive rules (`allow read, write: if true`) during initial local dev. | Must be user-scoped before any external access or staging deploy. |
| 6 | **CI/CD pipeline** | Manual `gcloud` deploy commands. | Before external user testing. |
| 7 | **Gap analysis LLM call** | Can start as a purely rule-based implementation (count unfilled nodes + incorrect quizzes + uncovered chunks) without an LLM call. Add LLM-powered topic naming later. | Phase 3. Rule-based is sufficient for demo if topic names are good. |
| 8 | **Frontend loading states** | Basic "Loading..." text instead of skeleton screens. | Phase 3 polish. |
| 9 | **Error handling / retry** | Minimal error display. No retry logic. | Phase 3 polish. |
| 10 | **Canvas auto-layout** | Simple grid or force-directed layout from React Flow defaults. | Polish. Can stay simple for v1. |

---

## What Should NOT Be Built Yet

These components must not be implemented in v1. Building them wastes time and risks scope creep.

| # | Component | Reason |
|---|---|---|
| 1 | Qdrant / Pinecone / Vertex Vector Search | Over-engineering. Firestore + numpy is the accepted v1 approach. |
| 2 | Rate limiting / API quotas | Use Firebase defaults. No custom throttling. |
| 3 | Email notifications / webhooks | No engagement loop needed. |
| 4 | Admin API / user management | No admin users in v1. |
| 5 | Teacher/course endpoints | No institutional features. |
| 6 | Payment processing | Manual onboarding. |
| 7 | UNI-Login / SAML SSO | Phase 3 institutional feature. |
| 8 | i18n framework | UI is English-only. Source material can be Danish. |
| 9 | Analytics / telemetry dashboard | Log to console. No dashboard. |
| 10 | Canvas undo/redo | State management complexity. Students can delete nodes. |
| 11 | Canvas export (image/PDF) | Nice-to-have only. |
| 12 | Spaced repetition scheduling | Quiz generation is in scope. Scheduling is v2. |
| 13 | Multiple tutor personalities | Single tutor persona. |
| 14 | WebSocket connections | SSE is sufficient for tutor streaming. |

---

## Abstraction Seams (Must Exist From Day One)

These interfaces must be defined as abstract classes/protocols before any implementation code is written. They are the mandatory extension points.

### Seam 1: LLMProvider

**File:** `backend/app/providers/base.py`

```python
class LLMProvider(ABC):
    async def generate(self, prompt, context, config) -> LLMResponse: ...
    async def stream_generate(self, prompt, context, config) -> AsyncIterator[str]: ...
    async def embed(self, texts) -> list[list[float]]: ...
```

**Why mandatory:** Every service calls this. Switching models later must be a config change, not a refactor.

**Leak check:** No service file should import `google.generativeai` or `openai` directly.

### Seam 2: ParserProvider

**File:** `backend/app/providers/parser.py`

```python
class ParserProvider(ABC):
    async def parse(self, file_path, file_type) -> ParsedDocument: ...
```

**Why mandatory:** PDF parsing libraries are fragile. May need to swap `unstructured` for `PyMuPDF` or a custom parser for Danish documents.

**Leak check:** No service file should import `unstructured` directly.

### Seam 3: VectorStore

**File:** `backend/app/providers/vector_store.py`

```python
class VectorStore(ABC):
    async def store_embeddings(self, chunks) -> None: ...
    async def search(self, query_embedding, source_ids, top_k) -> list[ScoredChunk]: ...
```

**Why mandatory:** v1 uses Firestore + numpy. v2 will use dedicated vector DB. The search service must not know or care which.

**Leak check:** `search_service.py` must call `VectorStore.search()`, never numpy directly.

### Seam 4: ObjectStore

**File:** `backend/app/providers/object_store.py`

```python
class ObjectStore(ABC):
    async def upload(self, file, path) -> str: ...
    async def download(self, path) -> bytes: ...
    async def delete(self, path) -> None: ...
```

**Why mandatory:** Cloud Storage may be replaced with S3 or local filesystem for testing.

### Seam 5: AuthProvider

**File:** `backend/app/providers/auth.py`

```python
class AuthProvider(ABC):
    async def verify_token(self, token) -> AuthenticatedUser: ...
```

**Why mandatory:** Firebase Auth will eventually be supplemented with UNI-Login SAML. The auth middleware must accept any OIDC token.

### Seam 6: Prompt Templates (Directory Seam)

**Directory:** `backend/app/prompts/`

**Files:** `canvas_prompts.py`, `tutor_prompts.py`, `quiz_prompts.py`, `gap_prompts.py`, `citation_prompts.py`

**Why mandatory:** Prompts are the most iterated component. They must be separate from service logic and provider code. A prompt change should never require modifying a service or provider file.

### Seam 7: EvidencePack (Data Contract Seam)

**File:** `backend/app/domain/models.py`

```python
@dataclass
class EvidencePack:
    query: str
    chunks: list[EvidenceChunk]
    source_ids: list[str]
    notebook_id: str
```

**Why mandatory:** This is the universal contract between retrieval and all generation services. Canvas, tutor, quiz, and gap services all receive an EvidencePack. Changing this contract changes everything downstream.

---

## Implementation Order Summary

```
Phase 1 (Real):   Auth → Upload → Parse → Chunk → Embed → Search → Citations
Phase 2 (Real):   Canvas Gen → Canvas UI → Tutor → Quiz
Phase 3 (Real):   Gap Hunter → Polish
Phase 1 (Mock):   Cloud Tasks (use asyncio), PPTX/DOCX (stub), Security rules (permissive)
Phase 2 (Mock):   OpenAI provider (stub), Canvas auto-layout (defaults)
Phase 3 (Unmock): Cloud Tasks → real, Security rules → strict, Loading states → polished
```

---

## Validation Checkpoints

| Checkpoint | When | What to Validate |
|---|---|---|
| **Spike: Danish PDF parsing** | Week 1, Day 1–2 | Parse 5 real Danish PDFs. Check chunk quality, page numbers, section titles. |
| **Seam smoke test** | Week 1, Day 3 | All 5 provider abstractions compile. One real implementation per seam passes a trivial test. |
| **Ingestion end-to-end** | End of Week 1 | Upload PDF → see chunks with embeddings in Firestore. |
| **Search end-to-end** | End of Week 2 | Query chunks and get relevant results with correct metadata. |
| **Citation end-to-end** | Early Week 3 | Generate canvas node → citation badge → click → see correct source passage. |
| **Tutor red-team** | Mid Week 3 | 20 direct-answer prompts. <10% leak rate. |
| **Full demo flow** | End of Week 5 | All 10 demo flows run without errors. |
