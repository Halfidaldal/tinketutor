# TinkeTutor v2 — Execution Task List

## Phase 1 — Validate Foundation & Rebrand

### Step 1.1: Local Validation Sprint
- [x] Backend: check dependencies and startup (Found: Requires Python 3.10+, 3.13 recommended)
- [x] Backend: verify source upload + processing pipeline
- [x] Backend: verify retrieval works
- [x] Backend: verify tutor session works
- [x] Frontend: check dependencies and startup
- [x] Frontend: verify pages render

### Step 1.2: Project Structure
- [x] Copy Educational_AI/apps/api/ → tinketutor/apps/api/
- [x] Copy Educational_AI/apps/web/ → tinketutor/apps/web/
- [x] Move tinketutor/open_notebook/ → tinketutor/legacy/open_notebook

### Step 1.3: Identity Rename
- [x] Replace "Synthesis Studio" / "Synthesis Canvas" in all user-facing copy
- [x] Update package.json, README, page titles

### Step 1.4: Danish-First Locale Foundation
- [x] Create apps/web/lib/i18n/ with da.json + en.json
- [x] Add locale context provider
- [x] Add DEFAULT_LOCALE config to backend

### Step 1.5: Vertex Runtime Configuration
- [x] Add role-based model routing to config
- [x] Update provider factory for tutor vs structured roles

## Phase 2 — Tutor-First Shell [IN PROGRESS]
- [ ] Implement tutor-first application shell layout
- [ ] Update TutorPanel.tsx for always-visible tutor
- [ ] Update TutorMessage.tsx with citations and escalation
- [ ] Add tutor orchestration mode enhancements

## Phase 3 — Workspace as Support Surface
- [ ] Reframe sources as "Study Materials"
- [ ] Rename Canvas → Knowledge Map in UI
- [ ] Enhance citation popovers

## Phase 4 — Quiz and Gap Through Tutor
- [ ] Wire quiz initiation through tutor
- [ ] Wire gap analysis through tutor voice

## Phase 5 — Hardening & Deployment
- [ ] Data layer production path decision
- [ ] Full naming cleanup audit
- [ ] Locale QA
- [ ] Deployment validation
