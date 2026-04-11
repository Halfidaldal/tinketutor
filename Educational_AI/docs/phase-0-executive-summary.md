# Phase 0 — Executive Summary

> **Historical v1 document.** This file describes the superseded v1 `Synthesis Studio` direction and is retained as a historical record. For the current product direction, use the v2 docs stack starting with [v2-master-brief.md](./v2-master-brief.md).

> **Codename:** Synthesis Studio
> **Date:** 2026-04-07
> **Full Brief:** [phase-0-master-implementation-brief.md](./phase-0-master-implementation-brief.md)

---

## What We're Building

An AI-powered educational workspace where students upload their own study materials and engage with them through a **Synthesis Canvas** (interactive concept map), **Socratic Tutor** (hints before answers), **Quiz Engine** (retrieval practice), and **Gap Hunter** (knowledge gap detection). Every AI output is grounded in exact source citations. There is no open-ended chat.

## Why It Should Exist

Current AI tools give students answers. Pedagogical research shows that retrieval practice, elaboration, and self-explanation produce durable learning — but no product makes these strategies the default UX. NotebookLM comes closest but still defaults to chat. We make the active path the only path.

## Core Learning Loop

```
Upload Sources → Skeleton Concept Map → Student fills gaps →
Socratic Tutor probes → Quiz confirms retention →
Gap Hunter reveals weak areas → Re-engage
```

## MVP Scope (6 Weeks)

| In Scope | Out of Scope |
|---|---|
| Source upload (PDF/PPTX/DOCX) | Multi-user collaboration |
| Exact chunk-level citations | Teacher dashboards |
| Synthesis Canvas with skeleton maps | Audio/video sources |
| Socratic Tutor (hints, not answers) | Mobile native app |
| Quiz/flashcard generation | Payment system |
| Gap Hunter | Institutional SSO (UNI-Login) |

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14+ App Router, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), stateless |
| Auth | Firebase Auth (email + Google) |
| Database | Firestore (notebook-centric document model) |
| Storage | Cloud Storage (uploaded files) |
| Vector Search | Firestore + numpy cosine similarity (v1 demo scale) |
| LLM | Gemini / OpenAI via provider abstraction layer |
| Deployment | Cloud Run (EU region) + Vercel |

## Bounded Contexts

| Context | Responsibility |
|---|---|
| **SourceIngestion** | Upload, parse, chunk, embed documents |
| **KnowledgeRetrieval** | Semantic search, citation resolution |
| **ActiveLearning** | Socratic tutor, quiz engine, gap analysis |
| **SynthesisWorkspace** | Canvas state, notebooks, nodes, edges |
| **Identity** | Auth (Firebase), user profiles |

## Build Sequence

| Phase | Duration | Goal |
|---|---|---|
| **1: Foundation** | Weeks 1–2 | Upload PDF → see parsed chunks with embeddings |
| **2: Core Learning** | Weeks 3–4 | Generate canvas → tutor → quiz with citations |
| **3: Intelligence** | Weeks 5–6 | Gap Hunter + polish + demo-ready |

## The "Aha Moment"

A student uploads biology slides → clicks "Generate Concept Map" → sees an interactive map of their material with 3 intentionally blank nodes → fills one in using source evidence → the node turns green with a citation badge linking to slide page 14.

This is the moment they understand: this tool doesn't answer for them — it makes them think.

## Top 5 Risks

1. **Students prefer easy tools** — active friction may drive them to ChatGPT
2. **Citation hallucination** — LLM may return invalid source references
3. **Danish PDF parsing quality** — unstructured library may struggle
4. **EU AI Act classification** — assessment features could trigger High-Risk tier
5. **Per-session LLM cost** — multiple calls per session may exceed budget

## Final Recommendation

**Build:** Source Upload → Synthesis Canvas → Citation pipeline as a polished vertical slice. The canvas IS the product.

**Don't build:** Any institutional, multi-user, or teacher-facing features. Serve a single student studying alone for an exam. Do that perfectly.
