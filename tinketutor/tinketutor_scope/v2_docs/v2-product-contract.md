# V2 Product Contract

> **Product:** TinkeTutor
> **Contract Version:** 2.0.0
> **Date:** 2026-04-10
> **Governing Brief:** [v2-master-brief.md](./v2-master-brief.md)
> **Status:** Binding for v2 implementation

---

## 1. Product Contract Summary

TinkeTutor v2 is a tutor-first web product where a specialized avatar-led tutor guides the student through studying their own materials. Sources, citations, quizzes, and gap analysis remain first-class capabilities, but they are not separate product pillars in the UI hierarchy. They are supporting systems behind the tutor experience.

The main question for every v2 feature is:

> Does this make the tutor more grounded, more pedagogically useful, or more effective at guiding the learner through their own materials?

If the answer is no, the feature is out of scope for v2.

---

## 2. The V2 Core Loop

```
Enter study context with tutor →
Tutor frames goal and next step →
Tutor grounds on sources and citations →
Tutor uses workspace/notebook state as support structure →
Tutor initiates or reviews quiz →
Tutor diagnoses gaps →
Tutor routes learner back to evidence and next action
```

The tutor is the visible through-line. The user should never feel they are switching between unrelated tools.

---

## 3. Product Invariants

1. The tutor is always the primary face of the product.
2. The product is grounded in user-provided sources, not general-model freeform answers.
3. User-facing framing should describe a guided study experience, not an "AI notebook."
4. Every retained v1 learning feature must now appear as part of the tutor loop.
5. Danish is the default user-facing language unless explicit context requires otherwise.
6. The product must not drift into a generic chat assistant or a generic productivity workspace.

---

## 4. In-Scope Features For V2

| Area | In Scope | Notes |
|---|---|---|
| Tutor-first shell | Persistent tutor avatar, visible study state, tutor-led entry flow | Main product surface |
| Grounded tutoring | Source-bounded tutor responses with citations and retrieval context | Non-negotiable |
| Sources library | Upload, processing status, source browsing, citation lookup | Supporting infrastructure, not top-level identity |
| Workspace support surface | Notebook/workspace, map/canvas, notes, or linked study artifacts | Secondary to tutor shell |
| Quiz generation and review | Tutor can start quizzes, review answers, explain mistakes, and cite evidence | Must feel like tutor action, not a detached quiz tool |
| Gap analysis and remediation | Tutor diagnoses weak areas and turns them into follow-up study actions | Must route back into grounded study work |
| Danish-first UI | Danish labels, flows, and tutor output with English fallback | See localization spec |
| Vertex-first runtime | One live Google/Vertex path for tutor streaming, structured generation, and embeddings | See runtime strategy |
| Product rename | `TinkeTutor` naming across docs, copy, and future public surfaces | See migration note |

---

## 5. Explicitly Out Of Scope For V2

| Feature / Direction | Why It Is Out |
|---|---|
| Generic blank chat app | Violates the tutor-first study contract |
| Multi-avatar marketplace or personality switching | Adds surface noise before the core tutor identity is stable |
| General browsing / internet answer mode | Breaks the source-grounded trust model |
| Re-centering the product around notebooks/canvases in marketing or IA | Repeats the v1 positioning problem |
| A hybrid multi-provider runtime with equal first-class support on day one | Creates unnecessary operational spread for v2 |
| Concurrent open-source/Gemma foundation work | Explicitly postponed to a later migration track |
| Teacher dashboards, institution admin, or broad classroom workflows | Not required to establish the v2 product identity |
| Social, collaboration, sharing, or publication surfaces | Not part of the tutor-first proof |
| Voice-first or multimodal tutor identity as a core v2 dependency | Optional later enhancement, not a v2 foundation requirement |

---

## 6. Non-Negotiable Experience Rules

### 6.1 Tutor-Led Entry

- The user should land in a tutor-led study context, not a blank notebook grid or empty canvas.
- The tutor should establish what the learner is studying, what evidence is available, and what the next action is.

### 6.2 Grounding Rules

- Tutor claims about the user's materials must be traceable to uploaded sources.
- Citation access must remain easy and visible.
- When the system cannot ground a claim in the user's material, it should either ask for more material or clearly mark the response as general guidance.

### 6.3 Workspace Rules

- Workspace state is still important, but it is subordinate to the tutor flow.
- Users may still create or inspect notebook/workspace artifacts, but those should appear as supporting views of the tutor's work.

### 6.4 Assessment Rules

- Quiz generation, quiz review, and gap remediation must be reachable from tutor-led actions.
- Quiz and gap outputs should feed back into the tutor's next recommendation.

---

## 7. What Remains From V1 Versus What Is Repositioned

| Capability | v1 Role | v2 Role |
|---|---|---|
| Notebook / workspace | Primary product frame | Internal study container and supporting surface |
| Tutor | Important but subordinate panel | Primary experience and visual identity |
| Sources | One feature among several | Ground-truth substrate for the tutor |
| Citations | Trust feature | Trust feature and tutor proof surface |
| Quiz | Standalone active-learning feature | Tutor-directed assessment and review tool |
| Gap Hunter | Separate intelligence feature | Tutor remediation system |

---

## 8. Acceptance Gates For V2 Scope

The v2 contract is being followed only if:

1. An implementation agent can describe the product in one sentence without calling it a notebook app.
2. The tutor is visibly primary in onboarding and main study flows.
3. Danish is treated as the default interface and output language.
4. The runtime plan does not require multiple equally supported providers.
5. Quiz, gaps, and workspace actions are clearly subordinate to the tutor flow.
6. No implementation plan item requires inventing a new strategic direction outside these documents.
