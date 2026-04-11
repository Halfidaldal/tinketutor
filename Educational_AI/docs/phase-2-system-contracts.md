# Phase 2 — System Contracts

> **Historical v1 document.** This file describes the superseded v1 `Synthesis Studio` direction and is retained as a historical record. For the current product direction, use the v2 docs stack starting with [v2-master-brief.md](./v2-master-brief.md).

> **Quick reference for implementation agents.**
> **Full architecture:** [phase-2-technical-architecture-pack.md](./phase-2-technical-architecture-pack.md)
> **Date:** 2026-04-07

---

## Bounded Contexts (Fixed)

| Context | Responsibility | Owns | Depends On |
|---|---|---|---|
| **SourceIngestion** | Upload, parse, chunk, embed documents | Source, Chunk, ProcessingJob (source_processing) | Identity, LLMProvider (embed) |
| **KnowledgeRetrieval** | Notebook-scoped semantic search, citation creation/validation | Citation, EvidencePack, vector index | SourceIngestion (reads chunks) |
| **ActiveLearning** | Socratic tutor, quiz generation, gap analysis | TutorSession, TutorMessage, QuizItem, QuizAttempt, KnowledgeGap | KnowledgeRetrieval, Identity, SynthesisWorkspace (reads canvas state) |
| **SynthesisWorkspace** | Notebook CRUD, canvas generation, node/edge CRUD | Notebook, SynthesisNode, SynthesisEdge | KnowledgeRetrieval, Identity |
| **Identity** | Auth delegation to Firebase Auth, user profiles | UserProfile | Firebase Auth (external) |

---

## Entity List (16 Entities)

| # | Entity | Context | Collection Path |
|---|---|---|---|
| 1 | UserProfile | Identity | `users/{userId}` |
| 2 | Notebook | SynthesisWorkspace | `notebooks/{notebookId}` |
| 3 | Source | SourceIngestion | `sources/{sourceId}` |
| 4 | Chunk | SourceIngestion | `sources/{sourceId}/chunks/{chunkId}` |
| 5 | ProcessingJob | Cross-cutting | `jobs/{jobId}` |
| 6 | Citation | KnowledgeRetrieval | `notebooks/{notebookId}/citations/{citationId}` |
| 7 | SynthesisNode | SynthesisWorkspace | `notebooks/{notebookId}/nodes/{nodeId}` |
| 8 | SynthesisEdge | SynthesisWorkspace | `notebooks/{notebookId}/edges/{edgeId}` |
| 9 | TutorSession | ActiveLearning | `notebooks/{notebookId}/tutorSessions/{sessionId}` |
| 10 | TutorMessage | ActiveLearning | `notebooks/{notebookId}/tutorSessions/{sessionId}/messages/{messageId}` |
| 11 | QuizItem | ActiveLearning | `notebooks/{notebookId}/quizItems/{quizItemId}` |
| 12 | QuizAttempt | ActiveLearning | `notebooks/{notebookId}/quizAttempts/{attemptId}` |
| 13 | KnowledgeGap | ActiveLearning | `notebooks/{notebookId}/gaps/{gapId}` |
| 14 | GapEvidence | ActiveLearning | Embedded in KnowledgeGap |
| 15 | EvidencePack | KnowledgeRetrieval | In-memory (not persisted) |
| 16 | EvidenceChunk | KnowledgeRetrieval | In-memory (not persisted) |

---

## API Groups (7 Groups, 22 Endpoints)

### SourceIngestion (5 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/sources` | Async (jobId) | ✅ |
| GET | `/api/v1/sources?notebookId=` | Sync | ✅ |
| GET | `/api/v1/sources/:id` | Sync | ✅ |
| DELETE | `/api/v1/sources/:id` | Sync | ❌ |
| GET | `/api/v1/sources/:id/chunks` | Sync | ✅ |

### KnowledgeRetrieval (2 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/search` | Sync | ✅ |
| GET | `/api/v1/citations/:id` | Sync | ✅ |

### SynthesisWorkspace (8 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/notebooks` | Sync | ✅ |
| GET | `/api/v1/notebooks` | Sync | ✅ |
| GET | `/api/v1/notebooks/:id` | Sync | ✅ |
| PUT | `/api/v1/notebooks/:id` | Sync | ❌ |
| DELETE | `/api/v1/notebooks/:id` | Sync | ❌ |
| POST | `/api/v1/notebooks/:id/generate-canvas` | Async (jobId) | ✅ |
| POST | `/api/v1/notebooks/:id/nodes` | Sync | ✅ |
| PUT | `/api/v1/notebooks/:id/nodes/:nodeId` | Sync | ✅ |

### ActiveLearning — Tutor (2 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/notebooks/:id/tutor/sessions` | Sync | ✅ |
| POST | `/api/v1/notebooks/:id/tutor/sessions/:sid/messages` | Sync (SSE stream) | ✅ |

### ActiveLearning — Quiz (3 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/notebooks/:id/quizzes/generate` | Async (jobId) | ✅ |
| GET | `/api/v1/notebooks/:id/quizzes` | Sync | ✅ |
| POST | `/api/v1/notebooks/:id/quizzes/:qid/submit` | Sync | ✅ |

### ActiveLearning — Gap Hunter (2 endpoints)
| Method | Path | Mode | Demo |
|---|---|---|---|
| POST | `/api/v1/notebooks/:id/gaps/analyze` | Async (jobId) | ✅ |
| GET | `/api/v1/notebooks/:id/gaps` | Sync | ✅ |

### Jobs (1 endpoint)
| Method | Path | Mode | Demo |
|---|---|---|---|
| GET | `/api/v1/jobs/:id` | Sync | ✅ |

---

## Sync vs. Async Classification (Fixed)

### Async (return jobId, poll for completion)
- Source processing (parse → chunk → embed)
- Canvas generation
- Quiz batch generation
- Gap analysis

### Sync (immediate response)
- All CRUD operations (notebooks, nodes, edges, sources)
- Semantic search
- Citation resolution
- Quiz answer submission + feedback

### Sync Streaming (SSE)
- Tutor message exchange

---

## Provider Interfaces (6 Abstractions)

### LLMProvider
```python
generate(prompt, context, config) → LLMResponse
stream_generate(prompt, context, config) → AsyncIterator[str]
embed(texts) → list[list[float]]
```
- v1: GoogleVertexProvider. OpenAIProvider stubbed.
- Located: `backend/app/providers/`

### ParserProvider
```python
parse(file_path, file_type) → ParsedDocument
```
- v1: UnstructuredParser
- Located: `backend/app/providers/`

### VectorStore
```python
store_embeddings(chunks) → None
search(query_embedding, source_ids, top_k) → list[ScoredChunk]
```
- v1: FirestoreVectorStore (Firestore + numpy)
- Located: `backend/app/providers/`

### ObjectStore
```python
upload(file, path) → str
download(path) → bytes
delete(path) → None
```
- v1: CloudStorageStore

### AuthProvider
```python
verify_token(token) → AuthenticatedUser
```
- v1: FirebaseAuthProvider

### EvidencePack (Shared Data Contract)
```python
@dataclass
class EvidencePack:
    query: str
    chunks: list[EvidenceChunk]
    source_ids: list[str]
    notebook_id: str
```
- Passed from KnowledgeRetrieval to all generation services.
- Not a provider — a shared domain contract.

---

## Key Technical Rules (Non-Negotiable)

1. **All LLM calls go through LLMProvider.** No direct SDK imports in services.
2. **All prompts live in `/prompts/`.** Not in services or providers.
3. **All search is notebook-scoped.** `sourceIds` mandatory on every search call.
4. **All citations are backend-validated.** Invalid chunk_ids silently stripped.
5. **All async operations use the job document pattern.** `POST` returns `{ jobId }`, client polls `GET /jobs/:id`.
6. **All endpoints require Firebase Auth.** No public endpoints.
7. **Firestore security rules enforce user isolation.** `userId == request.auth.uid`.
8. **Backend is stateless.** No in-memory state between requests (except in-process async tasks).
9. **Structured LLM output required** for canvas, quiz, and gap generation. Free-form only for tutor streaming.
10. **Tutor never gives direct answers.** System prompt enforces Socratic restraint.
