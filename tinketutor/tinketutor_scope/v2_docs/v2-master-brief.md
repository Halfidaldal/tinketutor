# V2 Master Brief

> **Product:** TinkeTutor
> **Canonical Product Identifier:** `TinkeTutor`
> **Date:** 2026-04-10
> **Status:** Governing v2 brief
> **Supersedes as current direction:** v1 phase documents while preserving them as historical records

---

## 1. V2 Thesis

TinkeTutor v2 is a specialized, avatar-led study product where the tutor is the main surface, the main guide, and the main reason the product feels different. The product still depends on user-provided sources, notebook/workspace structure, citations, quizzes, and gap analysis, but those are no longer the primary identity of the experience. They are grounding infrastructure behind a tutor-first workflow.

The v2 product is not "an AI notebook with a tutor attached." It is "a specialized tutor that works from your materials." The user should meet the tutor first, understand the study objective through the tutor, and only then move deeper into sources, workspace structure, quiz review, or remediation flows.

---

## 2. Understanding Summary

- The canonical v2 product name and governing identifier is `TinkeTutor`.
- The primary experience is tutor-first, not notebook-first.
- Danish is the default UI and tutor language, with English fallback where needed.
- Vertex-first proprietary runtime is the default v2 path, with one live provider path required.
- Sources, citations, quizzes, and gap analysis remain core product capabilities, but now serve the tutor-led study loop.
- The v1 phase docs remain in the repo as historical records and must not be rewritten to carry the v2 product thesis.

---

## 3. What Carries Forward From V1

The following v1 foundations remain valid and should be reused rather than re-litigated:

| Area | Retained from v1 | v2 Position |
|---|---|---|
| Source grounding | User uploads, parsing, chunking, retrieval, citation validation | Still mandatory; now framed as tutor grounding infrastructure |
| Core learning loop assets | Quiz generation, quiz review, gap analysis, workspace artifacts | Still in scope; exposed through tutor-led flows |
| Trust model | Exact source citations and retrieval-scoped generation | Still a differentiator and non-negotiable |
| Delivery shape | Next.js frontend, FastAPI backend, Firebase data plane, Cloud Run backend | Still valid with Vercel + Cloud Run deployment shape |
| Provider abstraction | A provider seam for LLM and embeddings | Retained, but only one live path is required in v2 |
| Security posture | Authenticated, user-scoped, source-bounded product | Still assumed |

---

## 4. What Changes In V2

| Area | v1 Framing | v2 Framing |
|---|---|---|
| Product identity | `Synthesis Studio`, notebook/canvas-led active-learning workspace | `TinkeTutor`, tutor-led study companion with grounded learning tools behind it |
| Main entry point | Create/open notebook, then explore features | Meet tutor, orient the study objective, then move into supporting tools |
| Surface hierarchy | Canvas/workspace dominates, tutor is a side panel | Tutor shell dominates, workspace is a supporting evidence/construction surface |
| UI language | English-first with Danish source handling | Danish-first with English fallback |
| Runtime strategy | Multi-provider abstraction with Gemini/OpenAI discussed in parallel | Proprietary-first, Google-first, single live Vertex path |
| Brand story | "Active-learning notebook" | "Specialized tutor with grounded study infrastructure" |

---

## 5. Product Identity Rules

1. The tutor avatar is the face of the product across onboarding, workspace, quiz review, and remediation.
2. There is no blank generic chat experience. Every conversation begins in a bounded study context.
3. Sources remain essential, but the product should not market itself or orient users as a notebook app.
4. Citations stay mandatory on grounded tutor claims and generated learning artifacts.
5. Quiz and gap analysis are retained because they deepen the tutor loop, not because they are standalone utilities.
6. Danish-first is not a translation afterthought. It is the default UX posture.
7. Open-source / Gemma migration is planned later work, not a day-one foundation requirement for v2.

---

## 6. Assumptions

- The repo continues to contain largely v1-oriented implementation and documentation naming for some period of time.
- Risky infrastructure renames may be sequenced after user-facing rename and product-shell work.
- Lowercase infrastructure identifiers such as domains, project IDs, and bucket names may need `tinketutor` even while the governing product identifier remains `TinkeTutor`.
- Notebook persistence remains useful as an internal study boundary even though notebook language is demoted in user-facing copy.
- The v2 implementation should preserve the current Firebase/Auth/Firestore/Storage foundations unless a later migration explicitly replaces them.

---

## 7. Open Questions

No open strategic questions remain for v2 planning. Tactical implementation choices may still exist, but the governing product direction is locked by this brief and its companion v2 documents.

---

## 8. Decision Log

| Decision | Alternatives Considered | Chosen Direction | Why |
|---|---|---|---|
| Product name | Keep `Synthesis Studio`; hybrid dual-brand; full rename | `TinkeTutor` | The v2 product must feel distinct from the notebook-first thesis |
| Primary surface | Notebook-first; equal notebook+tutor; tutor-first | Tutor-first | Reduces ambiguity and prevents accidental generic workspace positioning |
| Language posture | English-first; equal bilingual; Danish-first | Danish-first with English fallback | Matches target market and sharpens product identity |
| Runtime posture | Hybrid provider parity; open-source-first; Vertex-first proprietary | Vertex-first proprietary | Fastest path to a coherent v2 without parallel infra burden |
| Role of notebooks | Remove notebooks; keep notebook-first; retain as support structure | Retain as support structure | Preserves useful v1 architecture while changing the visible product identity |
| v1 docs strategy | Rewrite v1 docs into v2; delete old docs; freeze old docs | Freeze old docs, add v2 stack | Preserves historical traceability and avoids false continuity |

---

## 9. Reading Order For V2

1. [v2-product-contract.md](./v2-product-contract.md)
2. [v2-tutor-experience-spec.md](./v2-tutor-experience-spec.md)
3. [v2-language-and-localization-spec.md](./v2-language-and-localization-spec.md)
4. [v2-llm-runtime-strategy.md](./v2-llm-runtime-strategy.md)
5. [v2-architecture-delta.md](./v2-architecture-delta.md)
6. [v2-implementation-plan.md](./v2-implementation-plan.md)
7. [v2-rename-and-migration-note.md](./v2-rename-and-migration-note.md)
