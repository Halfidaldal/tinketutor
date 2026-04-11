# V2 Architecture Delta

> **Base Reference:** [phase-2-technical-architecture-pack.md](./phase-2-technical-architecture-pack.md)
> **Scope:** Only the architecture changes introduced by v2
> **Date:** 2026-04-10
> **Status:** Binding delta

---

## 1. Purpose Of This Document

This document does not restate the full v1 architecture. It records the architectural changes required to support the v2 product thesis: `TinkeTutor`, tutor-first surface hierarchy, Danish-first UX, and a single live Vertex-first runtime path.

If a v1 architectural decision is not overridden here, it remains unchanged.

---

## 2. Unchanged Foundations

These remain valid from the v1 pack:

- Next.js frontend
- FastAPI backend on Cloud Run
- Firebase Auth, Firestore, and Cloud Storage as the main data plane
- Source ingestion, retrieval, and citation validation model
- Provider abstraction seams
- Notebook/workspace-scoped state boundaries

---

## 3. Surface Hierarchy Delta

### V1

- Notebook/workspace was the dominant surface
- Tutor was a subordinate side-panel

### V2

- Tutor shell becomes the dominant product surface
- Workspace/notebook becomes a subordinate support surface
- Sources, quiz review, and gap remediation are entered through tutor-led actions

### Architectural Implication

Frontend composition should center the tutor session shell first, then load the supporting study surfaces around it. The user should not have to navigate away from the tutor context to reach the core study loop.

---

## 4. Bounded Context Naming Delta

The v1 context boundaries mostly remain, but the naming should shift away from v1 brand language in new docs and new code where practical.

| V1 Name | V2 Name | Change |
|---|---|---|
| `ActiveLearning` | `TutorExperience` | Makes the tutor-led orchestration explicit |
| `SynthesisWorkspace` | `StudyWorkspace` | Removes v1 product-language coupling |
| `SynthesisNode` / `SynthesisEdge` | `KnowledgeMapNode` / `KnowledgeMapEdge` or transitional aliases | Use neutral learning-domain naming in new work |

### Transitional Rule

Persistence collections, API paths, and existing code may keep legacy names temporarily if renaming them immediately would create migration risk. New documentation and new UI language should use the v2 names.

---

## 5. Tutor / Avatar Orchestration Delta

V2 introduces a stronger orchestration requirement around the tutor:

- tutor session state becomes a first-class shell concern
- tutor mode must adapt to onboarding, workspace guidance, quiz review, and gap remediation
- tutor responses need access to locale state, workspace state, and retrieval state in one coordinated flow

This does not require a separate distributed service on day one. It does require an explicit orchestration layer in the application design rather than treating tutor messaging as just another endpoint call.

Minimum orchestration inputs:

- active learner locale
- active study container / notebook
- source availability state
- retrieval evidence pack
- quiz review or gap remediation context when present

---

## 6. Language And Locale Delta

V1 tolerated English-first UI with Danish material. V2 does not.

New architectural requirement:

- locale becomes durable user state
- frontend must pass locale context on tutor and generation requests
- tutor orchestration must distinguish `ui_locale`, `response_locale`, and `source_locale`
- citation rendering must support UI metadata language separately from source excerpt language

This adds a product-layer locale contract even if the underlying storage model barely changes.

---

## 7. Runtime Strategy Delta

V1 architecture discussed provider abstraction in a more open-ended way. V2 constrains the live path:

- one live provider path: Vertex
- Flash-class route for tutor streaming
- Pro-class route for structured generation
- Vertex embeddings for retrieval

The abstraction seam stays. The operational burden of maintaining multiple production-ready providers does not.

---

## 8. Deployment Delta

The approved v2 deployment shape is:

- **Frontend:** Vercel
- **Backend:** Cloud Run
- **Auth / Data / Storage:** Firebase Auth, Firestore, Cloud Storage

This means:

- no v2 planning should assume Firebase Hosting as the primary frontend target
- Firebase Auth authorized domains must track Vercel hostnames
- environment and deploy docs should treat Vercel + Cloud Run as the normal path

---

## 9. Data Model And API Delta

No day-one persistence rewrite is required. The main delta is in orchestration and naming, not in wholesale storage redesign.

Recommended v2 posture:

- retain notebook/workspace-scoped storage for now
- allow tutor shell and route structure to become the primary navigation layer
- add tutor-mode and locale context where needed
- preserve backwards compatibility for existing notebook-scoped endpoints during transition

This avoids spending the first v2 milestone on migration plumbing instead of product shape.

---

## 10. Implementation Guardrail

If a proposed architectural change rewrites large parts of the existing backend before the tutor-first shell, Danish-first UX, and Vertex-first routing are in place, that work is almost certainly happening too early.
