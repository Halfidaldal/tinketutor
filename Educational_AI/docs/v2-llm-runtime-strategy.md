# V2 LLM Runtime Strategy

> **Product:** TinkeTutor
> **Scope:** Runtime and provider posture for v2
> **Date:** 2026-04-10
> **Status:** Binding

---

## 1. Governing Runtime Decision

TinkeTutor v2 is proprietary-first and Google-first.

The live v2 runtime path should run through Vertex and only Vertex. Provider abstraction remains in the architecture, but the product does not need a second production-ready provider path to begin v2 implementation.

This is an intentional simplification, not a temporary omission.

---

## 2. Why This Is The V2 Default

The v2 product problem is not "prove optionality across many model providers." The problem is "ship a coherent tutor-first product with grounded, Danish-first behavior and low-latency interactions."

Running one live provider path gives v2:

- simpler operations
- fewer test permutations
- clearer prompt tuning
- lower integration overhead
- a faster path to product coherence

---

## 3. Runtime Split By Job Type

| Job Type | Runtime Class | Reason |
|---|---|---|
| Tutor streaming | Vertex Flash-class model | Low-latency streaming and rapid turn-taking |
| Structured tutor planning when higher reliability is needed | Vertex Pro-class model | Better reasoning margin on higher-stakes structured steps |
| Quiz generation | Vertex Pro-class model | Higher-stakes structured educational outputs |
| Gap analysis and remediation synthesis | Vertex Pro-class model | Better structured diagnosis and follow-up generation |
| Workspace / map / study-structure generation | Vertex Pro-class model | Higher precision and structured output reliability |
| Retrieval embeddings | Vertex embeddings | Same-provider retrieval path and simpler ops |

### Practical Rule

Use Flash-class for the conversational surface.

Use Pro-class for the structured, correctness-sensitive generation tasks that shape what the tutor says or what the learner studies next.

---

## 4. Provider Abstraction Policy

The provider abstraction remains in place, but v2 only requires:

- one live `google_vertex` runtime path
- one embedding path on Vertex
- one operational prompt/evaluation loop

It does **not** require:

- keeping OpenAI feature parity
- equal support for multiple proprietary providers
- dual-provider failover at launch
- a parallel open-source runtime on day one

---

## 5. Configuration Direction

V2 should move away from a single generic model setting and toward explicit role-based runtime configuration.

Recommended direction:

| Runtime Need | Recommended Config Surface |
|---|---|
| Tutor low-latency streaming | `VERTEX_MODEL_FLASH` |
| Higher-stakes structured generation | `VERTEX_MODEL_PRO` |
| Retrieval embeddings | `VERTEX_EMBEDDING_MODEL` |
| Provider selection | `LLM_PROVIDER=google_vertex` |
| GCP routing | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` |

Compatibility with existing single-model config can be preserved during migration, but the v2 design should target explicit role-based model routing.

---

## 6. Retrieval And Grounding Policy

Retrieval remains source-bounded and notebook/workspace-scoped. Embeddings stay on Vertex for v2 so that:

- retrieval and generation are tuned within one provider family
- prompt debugging and evaluation stay simpler
- the team avoids premature multi-vendor retrieval divergence

Nothing in v2 requires a dedicated vector database migration on day one. The architecture may preserve the current seam while improving routing, quality, and evaluation.

---

## 7. What Is Deferred

The following are explicitly deferred to later work:

- Gemma or other open-source tutor runtime in production
- self-hosted inference as a core v2 dependency
- multi-provider routing policies
- runtime-level A/B switching across providers
- institutional sovereign-hosting track as a launch blocker

---

## 8. Planned Migration Path To Open Source Later

The later migration track should be treated as a follow-on program with its own gates:

1. Preserve provider seams and role-based model routing.
2. Add evaluation harnesses for tutor quality, grounding quality, Danish quality, and latency.
3. Introduce an open-source provider behind the existing abstraction only after parity criteria are defined.
4. Trial open-source/Gemma in shadow or non-default flows before making it a production default.
5. Decide separately whether retrieval embeddings also migrate or stay proprietary longer.

This keeps open-source as an intentional future option without forcing it into the v2 critical path.

---

## 9. Decision Guardrail

Any v2 implementation proposal that requires maintaining multiple first-class provider paths before the tutor-first product is stable should be rejected as scope drift.
