# Phase 1 — V1 Checklist

> **Historical v1 document.** This file describes the superseded v1 `Synthesis Studio` direction and is retained as a historical record. For the current product direction, use the v2 docs stack starting with [v2-master-brief.md](./v2-master-brief.md).

> **Quick Reference** — derived from [phase-1-v1-product-contract.md](./phase-1-v1-product-contract.md)
> **Date:** 2026-04-07

---

## In-Scope Features

- [ ] **F1: Source Upload** — PDF/PPTX/DOCX upload, parse, chunk, embed, store. Max 50 MB / 5 files per notebook.
- [ ] **F2: Exact Citations** — Chunk-ID-based citations on all AI outputs. Backend validation. Clickable badges with source popover.
- [ ] **F3: Synthesis Canvas** — Skeleton concept map generation (10–15 nodes, 2–4 skeleton). Node editing. Drag/pan/zoom. Completion indicator.
- [ ] **F4: Socratic Tutor** — Source-grounded questioning. Hints before answers. Streaming SSE. 20-message session limit. "Show relevant passage" escape valve.
- [ ] **F5: Quiz / Flashcards** — 5–10 items per batch. MCQ + open-ended. Feedback with citations. Results summary.
- [ ] **F6: Gap Hunter** — Analyze canvas + quiz signals. Output gap list with confidence scores. One-click "quiz on this topic."

---

## Out-of-Scope Features

| Feature | Decision |
|---|---|
| Multi-user collaboration | Postponed v2+ |
| Teacher dashboard / analytics | Postponed v2 |
| Audio/video source upload | Postponed v2 |
| Mobile native app | Postponed v3 |
| Admin dashboard | Postponed v3 |
| Payment / subscription | Postponed v2 |
| Public sharing / publishing | Postponed v2+ |
| Web scraping sources | Postponed v2 |
| Custom model fine-tuning | Dropped |
| Offline mode | Dropped |
| Plugin / extension system | Dropped |
| SSO beyond Firebase Auth | Postponed v3 |
| Roleplay / simulations | Postponed v2 |
| Image generation | Postponed v2 |
| Spaced repetition scheduling | Postponed v2 |
| General chat / ask-anything | **Rejected permanently** |
| Notification system | Postponed v2 |
| Multi-language UI | Postponed v2 |
| Canvas export (image/PDF) | Postponed v2 |

---

## Demo-Critical Flows

All must work end-to-end without errors for the demo to be considered ready.

- [ ] **Flow 1:** Sign in with Google → see dashboard
- [ ] **Flow 2:** Create notebook with title → see workspace with tabs
- [ ] **Flow 3:** Upload PDF → processing animation → "Ready" with chunk count → view chunks
- [ ] **Flow 4:** Upload second PDF → both sources listed as "Ready"
- [ ] **Flow 5:** Generate concept map → skeleton nodes visible → canvas zoomable/pannable
- [ ] **Flow 6:** Click skeleton node → see guiding question → type answer → node turns green → citation badge appears
- [ ] **Flow 7:** Click citation badge → popover shows source title, page, section, chunk text
- [ ] **Flow 8:** Open tutor → get Socratic question (not a direct answer) → tutor references source pages → streaming response
- [ ] **Flow 9:** Generate quiz → answer 5 questions → see results with citations on explanations
- [ ] **Flow 10:** Analyze gaps → see gap list with evidence → click "Start quiz on this topic" → targeted quiz appears

---

## Launch Blockers

Every item must pass. One failure = not ready for demo.

- [ ] **LB-1:** 10-page PDF uploads and produces chunks with page metadata within 60 seconds
- [ ] **LB-2:** Canvas generation produces a coherent skeleton map (5+ nodes, skeleton nodes present)
- [ ] **LB-3:** Citation badges show the correct source passage when clicked
- [ ] **LB-4:** Socratic tutor passes red-team test: <10% of 20 direct-answer prompts leak actual answers
- [ ] **LB-5:** Quiz questions reference only information present in uploaded sources
- [ ] **LB-6:** User A cannot access User B's notebooks or sources
- [ ] **LB-7:** Complete 10-step demo flow runs without errors
- [ ] **LB-8:** Canvas nodes are draggable, clickable, and fillable
- [ ] **LB-9:** Gap Hunter produces results when notebook has unfilled nodes and incorrect quiz answers

---

## Build Order (Strict Dependencies)

```
1. Firebase Auth + Project Setup
2. FastAPI Scaffold + Auth Middleware  |  Next.js Scaffold + Auth Flow  (parallel)
3. Source Upload + Cloud Storage
4. Document Parsing + Chunking
5. Embedding Generation
6. Semantic Search
7. Citation Service
8. Canvas Generation  |  Socratic Tutor  |  Quiz Generation  (parallel after citation)
9. Canvas UI  |  Tutor UI  |  Quiz UI  (parallel after respective backends)
10. Gap Hunter (requires canvas + quiz data)
11. Demo Polish
```

---

## Non-Negotiable Acceptance Criteria (Top 7)

1. PDF upload → chunks with page metadata within 60 seconds
2. Every AI-generated canvas node has at least 1 valid citation
3. Canvas generation produces 10–15 nodes with 2–4 skeleton nodes
4. Tutor never gives a direct factual answer — redirects to sources or asks questions
5. Quiz explanations include at least 1 citation pointing to the correct source passage
6. Gap analysis uses canvas coverage + quiz performance as inputs and produces actionable results
7. User data isolation: no cross-user data access on any endpoint

---

## Priority User Stories (Top 7)

1. **US-5:** Generate a concept map from uploaded sources with intentional gaps
2. **US-6:** Fill a blank canvas node with evidence and source citation
3. **US-3:** Upload PDF study materials for processing
4. **US-8:** View exact source evidence behind any AI output via citation badge
5. **US-9:** Ask tutor for help and receive guidance, not direct answers
6. **US-11:** Generate a quiz grounded in uploaded sources
7. **US-13:** Discover knowledge gaps and see which topics need more study

---

## Scope Traps to Avoid (Top 7)

1. **Adding a general chat input anywhere in the UI** — destroys product identity
2. **Building teacher/admin views or role-based access** — months of work, zero demo value
3. **Deploying a dedicated vector database (Qdrant/Pinecone)** — over-engineering for <5K chunks/user
4. **Implementing spaced repetition or learning analytics** — postponed; Gap Hunter is the v1 intelligence layer
5. **Supporting every document format or web URLs** — PDF/PPTX/DOCX only
6. **Polishing UI before all features work** — polish is Phase 3, features are Phase 1–2
7. **Building notification/email/social features** — no engagement loop needed for a demo
