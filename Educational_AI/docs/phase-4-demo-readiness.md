# Phase 4 — Demo Readiness Runbook

> **Historical v1 document.** This file describes the superseded v1 `Synthesis Studio` direction and is retained as a historical record. For the current product direction, use the v2 docs stack starting with [v2-master-brief.md](./v2-master-brief.md).

## Purpose

Final acceptance gate for the v1 demo slice. This phase does not add product scope. It verifies that the existing upload → canvas → tutor → quiz → gap loop is stable enough to demo and deploy.

## Required Environment Variables

### Backend (`apps/api`)

- `ENVIRONMENT`
- `CORS_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `GOOGLE_APPLICATION_CREDENTIALS` or Cloud Run ADC
- `FIREBASE_AUTH_EMULATOR_HOST` for local emulator runs
- `FIRESTORE_EMULATOR_HOST` for local emulator runs
- `STORAGE_EMULATOR_HOST` for local emulator runs
- `OBJECT_STORE_BACKEND`
- `PARSER_BACKEND`
- `LLM_PROVIDER`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_MODEL`
- `EMBEDDING_MODEL`

### Frontend (`apps/web`)

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_USE_EMULATORS` for local emulator runs
- `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` for local emulator runs
- `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST` for local emulator runs
- `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT` for local emulator runs
- `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST` for local emulator runs
- `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT` for local emulator runs

## Local Verification

1. Run `make acceptance-backend`.
   On macOS, this target will use a Homebrew OpenJDK automatically if Java 21+ is not already on `PATH`.
2. Run `cd apps/api && PYTHONPATH=. ./.venv/bin/pytest -q` only when the Firebase emulators are already running. Missing emulators should fail immediately with a clear message.
3. Run `cd apps/web && npm run lint`.
4. Run `cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 NEXT_PUBLIC_FIREBASE_API_KEY=test NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=test NEXT_PUBLIC_FIREBASE_PROJECT_ID=test NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=test NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=test NEXT_PUBLIC_FIREBASE_APP_ID=test npm run build`.
5. Optional combined path: `make acceptance`.

## CI Verification

- Workflow: `.github/workflows/ci.yml`
- Backend job installs Node, Java 21+, and Python, starts Firebase emulators, and runs backend pytest under the emulator environment.
- Frontend jobs run `npm run lint` and `npm run build` with explicit public placeholder env values.

## Demo-Critical Flows

1. Sign in with Google and land on the dashboard.
2. Create a notebook and enter the workspace.
3. Upload the first source and wait for `Ready`.
4. Upload the second source and confirm both are `Ready`.
5. Generate the concept map and confirm skeleton nodes plus pan/zoom.
6. Fill a skeleton node, save it, and confirm the node turns complete with citations.
7. Open a citation badge and confirm source title, page, section, and chunk text.
8. Start the tutor and confirm the first response is Socratic, streamed, and source-grounded.
9. Generate a quiz, answer all questions, and confirm explanations include citations.
10. Run gap analysis and launch a targeted quiz from one returned gap.

## Go / No-Go Gate

Go only if all of the following are true:

- Backend tests pass against Firebase emulators.
- Frontend lint passes.
- Frontend build passes with explicit placeholder env values.
- The 10 demo-critical flows are manually demoable.
- Launch blockers from `docs/phase-1-v1-checklist.md` are all green.
- Backend deploy target is known and approved.
- Vercel team/project linkage is already established.
- Firebase Auth authorized domains are confirmed for the deployed frontend URL.

No-go on any single failure.

## Deployment Order

1. Verify the acceptance gate locally and in CI.
2. Deploy the backend from `apps/api` to Cloud Run in an EU region.
3. Verify backend `GET /api/v1/health`.
4. Verify backend `GET /api/v1/ready`.
5. Deploy the frontend from `apps/web` to Vercel.
6. Set `NEXT_PUBLIC_API_URL` in Vercel to the deployed backend `/api/v1` base URL.
7. Verify the frontend loads and is calling the intended backend.
8. Confirm Firebase Auth authorized domains include the deployed Vercel hostname before demoing sign-in.

## Rollback and Blocker Reporting

- Backend rollback: redeploy the last known-good Cloud Run revision.
- Frontend rollback: promote or restore the last known-good Vercel deployment.
- If the gate fails, stop deployment and report blockers with:
  - failing command or flow
  - exact error or missing prerequisite
  - user impact on the 10-step demo
  - unblock action and owner
