# V2 Implementation Plan

> **Product:** TinkeTutor
> **Date:** 2026-04-10
> **Status:** Execution plan for v2
> **Depends On:** [v2-master-brief.md](./v2-master-brief.md), [v2-product-contract.md](./v2-product-contract.md)

---

## 1. Planning Principle

V2 should begin by changing the product shell, the language posture, and the runtime posture before it expands retained learning features. The team should not begin with deep feature additions while the product still feels like v1.

---

## 2. Phase Overview

| Phase | Goal | Why It Comes First |
|---|---|---|
| 1 | Rename + tutor-first shell + Danish-first foundations + Vertex role split | Establishes the real v2 identity immediately |
| 2 | Tutor-led onboarding and grounded study entry | Makes the tutor the front door instead of a panel |
| 3 | Tutor-guided workspace and source support surfaces | Repositions notebooks/sources without deleting useful v1 infrastructure |
| 4 | Tutor-mediated quiz review and gap remediation | Reconnects retained v1 learning systems to the tutor loop |
| 5 | Hardening, migration cleanup, and open-source preparation seams | Stabilizes the v2 shape before broader expansion |

---

## 3. Phase Details

### Phase 1 — Rename, Shell, Language, Runtime

**Primary objective:** make the product unmistakably v2.

**Work:**

- rename visible product copy from `Synthesis Studio` to `TinkeTutor`
- introduce tutor-first application shell and navigation hierarchy
- establish Danish-first UI copy path with English fallback
- split runtime routing into Flash-class tutor path and Pro-class structured path on Vertex
- update docs and environment strategy to reflect Vercel + Cloud Run

**Do not do in this phase:**

- deep workspace redesign
- teacher/institution features
- open-source runtime work

**Exit criteria:**

- the app no longer presents itself as notebook-first
- the tutor is the visible primary shell
- Danish-first copy exists for core user flows
- runtime strategy is wired for role-based Vertex usage

### Phase 2 — Tutor-Led Onboarding And Study Entry

**Primary objective:** the first meaningful user experience starts with the tutor.

**Work:**

- tutor-led onboarding flow
- study context framing based on available sources
- first-action suggestions through the tutor
- clear handling for empty, partial, and ready source states
- locale-aware tutor output defaults

**Exit criteria:**

- a new user meets the tutor before exploring supporting surfaces
- tutor can explain what materials are available and what to do next
- empty-state flows do not fall back to generic chat

### Phase 3 — Workspace And Sources As Supporting Surfaces

**Primary objective:** keep the valuable v1 structure while demoting it from the product identity.

**Work:**

- reframe notebook/workspace UI as tutor support surfaces
- align source library, citations, and workspace artifacts with tutor-led actions
- rename visible terminology away from "Synthesis" and away from notebook-centric marketing
- ensure tutor can route into and out of source evidence smoothly

**Exit criteria:**

- sources and workspace feel subordinate to the tutor
- user can inspect evidence and work artifacts without losing tutor context
- visible product framing no longer depends on the notebook metaphor

### Phase 4 — Quiz Review And Gap Remediation Through The Tutor

**Primary objective:** make retained v1 assessment systems feel native to v2.

**Work:**

- tutor-triggered quiz generation
- tutor-led answer review and explanation
- tutor-driven gap diagnosis and remediation suggestions
- route errors and weak areas back into evidence-backed next steps

**Exit criteria:**

- quiz review is presented as a tutor action, not a detached feature
- gap analysis feeds naturally into follow-up study actions
- the user experiences one continuous tutor-led loop

### Phase 5 — Hardening And Migration Cleanup

**Primary objective:** stabilize v2 and prepare future optionality without reopening strategy.

**Work:**

- clean up remaining public-facing legacy naming
- normalize config and deployment docs
- tighten locale coverage and QA
- prepare evaluation seams for a later open-source/Gemma track
- decide which legacy technical IDs remain temporarily preserved

**Exit criteria:**

- public v2 naming is coherent
- deploy and auth config reflect the approved hosting shape
- the codebase has a clean future seam for later runtime migration

---

## 4. Sequencing Guardrails

1. Do not start with backend rewrites that are invisible to the product identity shift.
2. Do not build new v2 features on top of English-first assumptions.
3. Do not treat open-source runtime migration as parallel mandatory work.
4. Do not redesign every retained v1 subsystem before the tutor-first shell is real.
5. Do not ship a renamed product that still behaves like a notebook-first app.

---

## 5. First Execution Slice

If an implementation agent needs the immediate starting slice, it should begin with:

1. rename user-facing product copy to `TinkeTutor`
2. create the tutor-first shell and landing hierarchy
3. establish Danish-first core UI copy and locale plumbing
4. wire explicit Vertex Flash/Pro runtime roles

Only after that slice is stable should the agent move deeper into workspace, quiz, and gap flows.
