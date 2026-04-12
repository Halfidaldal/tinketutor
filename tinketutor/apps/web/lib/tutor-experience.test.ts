/**
 * Tests the API surface that `useTutorSessionController` relies on.
 *
 * The controller is a thin React state shell over `api.tutor.*` and
 * `api.notebooks.bootstrap`. Verifying that the locale dimensions
 * (`uiLocale` / `responseLocale` / `locale`) are forwarded on every
 * tutor request is the load-bearing guarantee of v2-language-spec §1/§7,
 * so we test that here without standing up a React renderer.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, beforeEach } from 'node:test';

// Stub Firebase public env so loading `lib/api` (which transitively loads
// `lib/firebase`) does not throw during the test run. Must be set before
// the synchronous `require('./api')` below.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= 'test-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= 'test.appspot.com';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= '0';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= 'test-app-id';
process.env.NEXT_PUBLIC_API_URL ??= 'http://localhost:5055/api/v1';

const require = createRequire(import.meta.url);
const { api } = require('./api') as typeof import('./api');

interface CapturedRequest {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

const captured: CapturedRequest[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  captured.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    captured.push({
      url,
      method: (init?.method || 'GET').toUpperCase(),
      body,
    });
    return new Response(JSON.stringify({ session: { id: 'session-1' }, turn: { id: 'turn-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('api.tutor.bootstrapSession serializes both locale dimensions and posts to bootstrap path', async () => {
  await api.tutor.bootstrapSession('notebook-1', { uiLocale: 'da', responseLocale: 'en' });

  assert.equal(captured.length, 1);
  const [request] = captured;
  assert.equal(request.method, 'POST');
  assert.match(request.url, /\/notebooks\/notebook-1\/tutor\/sessions\/bootstrap$/);
  assert.deepEqual(request.body, { uiLocale: 'da', responseLocale: 'en' });
});

test('api.tutor.startSession forwards locale dimensions alongside the query payload', async () => {
  await api.tutor.startSession('notebook-1', {
    query: 'Forklar emnet',
    sourceIds: ['source-1'],
    uiLocale: 'da',
    responseLocale: 'da',
    locale: 'da',
  });

  assert.equal(captured.length, 1);
  const [request] = captured;
  assert.equal(request.method, 'POST');
  assert.match(request.url, /\/notebooks\/notebook-1\/tutor\/sessions$/);
  assert.deepEqual(request.body, {
    query: 'Forklar emnet',
    sourceIds: ['source-1'],
    locale: 'da',
    uiLocale: 'da',
    responseLocale: 'da',
  });
});

test('api.tutor.sendTurn forwards locale dimensions for follow-up turns', async () => {
  await api.tutor.sendTurn('notebook-1', 'session-1', 'Mere kontekst', {
    uiLocale: 'da',
    responseLocale: 'en',
  });

  assert.equal(captured.length, 1);
  const [request] = captured;
  assert.equal(request.method, 'POST');
  assert.match(request.url, /\/notebooks\/notebook-1\/tutor\/sessions\/session-1\/turns$/);
  assert.deepEqual(request.body, {
    content: 'Mere kontekst',
    uiLocale: 'da',
    responseLocale: 'en',
  });
});

test('api.tutor.escalate forwards locale dimensions and the escalation action', async () => {
  await api.tutor.escalate('notebook-1', 'session-1', {
    action: 'show_more_help',
    uiLocale: 'da',
    responseLocale: 'da',
  });

  assert.equal(captured.length, 1);
  const [request] = captured;
  assert.equal(request.method, 'POST');
  assert.match(request.url, /\/notebooks\/notebook-1\/tutor\/sessions\/session-1\/escalate$/);
  assert.deepEqual(request.body, {
    action: 'show_more_help',
    uiLocale: 'da',
    responseLocale: 'da',
  });
});

test('api.notebooks.bootstrap forwards locale dimensions for default-space creation', async () => {
  await api.notebooks.bootstrap({ uiLocale: 'da', responseLocale: 'da' });

  assert.equal(captured.length, 1);
  const [request] = captured;
  assert.equal(request.method, 'POST');
  assert.match(request.url, /\/notebooks\/bootstrap$/);
  assert.deepEqual(request.body, { uiLocale: 'da', responseLocale: 'da' });
});
