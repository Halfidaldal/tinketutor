# Infrastructure

Deployment configuration notes for Synthesis Studio.

## v1 Deployment (Demo)

- **Frontend:** Firebase Hosting (static export from Next.js)
- **Backend:** Cloud Run (single service, europe-west1)
- **Database:** Firestore (same Firebase project)
- **Storage:** Cloud Storage (same Firebase project)
- **Auth:** Firebase Auth (Email + Google provider)

## Cloud Run Configuration

```yaml
# Minimum for demo: 1 instance to avoid cold starts (per risk §14.2.5)
minInstances: 1
maxInstances: 3
memory: 512Mi
cpu: 1
region: europe-west1
```

## Environment Variables for Cloud Run

See `apps/api/.env.example` for the full list.
Set via `gcloud run deploy --set-env-vars` or Cloud Console.

## Firebase Emulators (Local Development)

```bash
firebase emulators:start
# Auth: localhost:9099
# Firestore: localhost:8080
# Storage: localhost:9199
# Emulator UI: localhost:4000
```

## CI/CD (TODO)

- `.github/workflows/frontend-ci.yml` — lint + build Next.js on PR
- `.github/workflows/backend-ci.yml` — lint + test FastAPI on PR
