.DEFAULT_GOAL := help

FIREBASE_TEST_PROJECT ?= tinktetutor
FIREBASE_EMULATORS ?= auth,firestore,storage
BACKEND_PYTEST = cd apps/api && PYTHONPATH=. ./.venv/bin/pytest -q
FRONTEND_BUILD_ENV = NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 NEXT_PUBLIC_FIREBASE_API_KEY=test NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=test NEXT_PUBLIC_FIREBASE_PROJECT_ID=test NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=test NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=test NEXT_PUBLIC_FIREBASE_APP_ID=test
HOMEBREW_OPENJDK17 := $(shell if command -v brew >/dev/null 2>&1; then brew --prefix openjdk@17 2>/dev/null; fi)
HOMEBREW_OPENJDK := $(shell if command -v brew >/dev/null 2>&1; then brew --prefix openjdk 2>/dev/null; fi)
JAVA_ENV_PREFIX = if java -version >/dev/null 2>&1; then :; elif [ -x "$(HOMEBREW_OPENJDK)/bin/java" ]; then export JAVA_HOME="$(HOMEBREW_OPENJDK)/libexec/openjdk.jdk/Contents/Home"; export PATH="$(HOMEBREW_OPENJDK)/bin:$$PATH"; elif [ -x "$(HOMEBREW_OPENJDK17)/bin/java" ]; then export JAVA_HOME="$(HOMEBREW_OPENJDK17)/libexec/openjdk.jdk/Contents/Home"; export PATH="$(HOMEBREW_OPENJDK17)/bin:$$PATH"; else echo "Java 21+ is required for Firebase emulators. Install a compatible JDK or make it available on PATH." && exit 1; fi;

# ===== Development =====

.PHONY: dev-frontend
dev-frontend: ## Start Next.js dev server
	cd apps/web && npm run dev

.PHONY: dev-backend
dev-backend: ## Start FastAPI dev server
	cd apps/api && uvicorn app.main:app --reload --port 8000

.PHONY: dev
dev: ## Start both frontend and backend (requires tmux or two terminals)
	@echo "Start in two terminals:"
	@echo "  Terminal 1: make dev-frontend"
	@echo "  Terminal 2: make dev-backend"

# ===== Setup =====

.PHONY: setup-frontend
setup-frontend: ## Install frontend dependencies
	cd apps/web && npm install

.PHONY: setup-backend
setup-backend: ## Set up backend venv and install deps
	cd apps/api && python -m venv .venv && ./.venv/bin/pip install -r requirements.txt

.PHONY: setup
setup: setup-frontend setup-backend ## Set up both frontend and backend

# ===== Firebase =====

.PHONY: emulators
emulators: ## Start Firebase emulators
	@$(JAVA_ENV_PREFIX) firebase emulators:start --only $(FIREBASE_EMULATORS) --project $(FIREBASE_TEST_PROJECT)

# ===== Testing =====

.PHONY: test-backend
test-backend: ## Run backend tests (requires emulators already running)
	$(BACKEND_PYTEST)

.PHONY: acceptance-backend
acceptance-backend: ## Run backend acceptance tests through Firebase emulators (matches CI)
	@command -v firebase >/dev/null 2>&1 || (echo "firebase CLI is required for emulator-backed backend tests." && exit 1)
	@$(JAVA_ENV_PREFIX) firebase emulators:exec --only $(FIREBASE_EMULATORS) --project $(FIREBASE_TEST_PROJECT) '$(BACKEND_PYTEST)'

.PHONY: test-frontend
test-frontend: ## Run frontend lint
	cd apps/web && npm run lint

.PHONY: build-frontend
build-frontend: ## Build frontend with explicit public env placeholders
	cd apps/web && $(FRONTEND_BUILD_ENV) npm run build

# ===== Linting =====

.PHONY: lint-frontend
lint-frontend: ## Lint frontend
	cd apps/web && npm run lint

.PHONY: acceptance-frontend
acceptance-frontend: lint-frontend build-frontend ## Run frontend acceptance checks

.PHONY: acceptance
acceptance: acceptance-backend acceptance-frontend ## Run the full Phase 4 acceptance gate locally

# ===== Help =====

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
