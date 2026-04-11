# V2 Rename And Migration Note

> **Rename:** `Synthesis Studio` → `TinkeTutor`
> **Date:** 2026-04-10
> **Status:** Planning note for v2 migration work

---

## 1. Governing Naming Decision

The v2 product name is `TinkeTutor`.

Naming policy:

- **Canonical product name:** `TinkeTutor`
- **Canonical product identifier in docs:** `TinkeTutor`
- **Lowercase infra/domain form where required by platforms:** `tinketutor`

The product should not continue to present `Synthesis Studio` publicly once v2 implementation starts landing.

---

## 2. Rename Scope

The rename affects:

- product copy
- docs
- metadata and titles
- repo terminology
- deployment/project naming decisions
- auth/domain configuration
- environment/config contracts where naming is product-coupled

---

## 3. What Must Change Early

| Area | Required Early Change |
|---|---|
| UI copy | Replace `Synthesis Studio` with `TinkeTutor` |
| Metadata | App title, login title, page metadata, README headline |
| Docs | Introduce v2 docs stack and mark v1 docs historical |
| Product vocabulary | Stop describing the product as a notebook-first workspace |
| Deployment docs | Treat Vercel + Cloud Run as the normal frontend/backend path |

---

## 4. What May Stay Legacy Temporarily

These may be preserved for a controlled transition if renaming them immediately is risky:

- existing Firebase project IDs
- existing storage bucket names
- existing Cloud Run service names
- package names such as `synthesis-studio-api`
- persistence collection names tied to v1 implementation

### Transitional Rule

Public-facing naming must move first. Infrastructure/resource renames may follow later if they risk downtime, auth breakage, or unnecessary migration churn.

---

## 5. Impact Matrix

| Surface | Impact | v2 Policy |
|---|---|---|
| Docs | Old v1 docs preserved, new v2 docs added | Freeze old phase docs, do not retrofit them into v2 |
| UI copy | Current repo still contains `Synthesis Studio` labels | Replace with `TinkeTutor` in public surfaces |
| Repo terminology | `SynthesisWorkspace` and similar names remain | Use v2 names in docs/new code; migrate old names selectively |
| Vercel | Project/domain naming may need refresh | Prefer `tinketutor` naming for project/domain if changed |
| Firebase Auth | Authorized domains must match new Vercel hosts | Update before public rollout |
| GCP / Cloud Run | Service naming may remain legacy temporarily | Only rename if low-risk or part of scheduled migration |
| README / onboarding | v1 framing is outdated | Rewrite public onboarding to tutor-first framing |

---

## 6. Environment Variable And Config Impacts

### Preserve

The following existing config surfaces can remain if they are not product-name specific:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_FIREBASE_*`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`

### Add Or Reframe

| Need | Recommended Direction |
|---|---|
| Explicit product identity | add `PRODUCT_NAME=TinkeTutor` if the app wants a runtime-configured display name |
| Public slug handling | use `tinketutor` for domains/hostnames where lowercase is required |
| Runtime role split | move toward `VERTEX_MODEL_FLASH`, `VERTEX_MODEL_PRO`, `VERTEX_EMBEDDING_MODEL` |

### Deprecate Over Time

- hard-coded `Synthesis Studio` strings in app code
- single ambiguous model config when role-based routing is introduced

---

## 7. Domain, Auth, And Deployment Impacts

1. Vercel project naming and production hostname should align to `tinketutor` where practical.
2. Firebase Auth authorized domains must be updated for the active Vercel hostnames before rollout.
3. Any OAuth consent-screen or sign-in copy that still references `Synthesis Studio` must be refreshed.
4. CORS allowlists and callback URLs must be reviewed when hostname changes occur.

---

## 8. Repo-Wide Terminology Changes

Preferred v2 terms:

- `TinkeTutor` instead of `Synthesis Studio`
- `StudyWorkspace` / `arbejdsrum` instead of `SynthesisWorkspace` where feasible
- tutor-first language instead of notebook-first language

### Known Legacy Risk

The repository already contains naming drift and at least one likely typo-shaped project identifier (`tinktetutor` in local tooling). Migration work should normalize these intentionally rather than letting multiple near-duplicates persist.

---

## 9. Migration Sequence

1. Public-facing docs and copy
2. Tutor-first product shell and IA
3. Auth/domain/deploy config alignment
4. Optional low-risk technical renames
5. High-risk infra/resource renames only if they still matter after the v2 shell is stable

This sequence minimizes the chance of spending the first v2 milestone on infrastructure churn instead of product repositioning.
