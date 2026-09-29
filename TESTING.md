# Bob Board — Test Coverage

This document describes the full test suite, what each file covers, how to run
the tests, and what was validated as of the last test run.

---

## Running the tests

```bash
# Backend (all 5 files, ~2 seconds)
cd backend && node --test beta-runtime.test.cjs opencode-adapter.test.cjs \
  bob-gateway-auth.test.cjs bob-gateway-client.test.cjs server-routes.test.cjs

# Or via npm
cd backend && npm test

# Frontend / api transport (root of repo)
node --test beta-api.test.mjs model-picker.test.mjs
```

---

## Test files

### Backend

| File | What it covers | Tests |
|---|---|---|
| `backend/beta-runtime.test.cjs` | File attachment validation, path safety, chat args, streaming output, cancel/disconnect, timeouts, output limits, process-tree kill | 11 |
| `backend/opencode-adapter.test.cjs` | MCP config generation, permission scoping, env expansion, disabled/missing server errors | 3 |
| `backend/bob-gateway-auth.test.cjs` | IBMid OAuth flow: one-time state, token exchange, serialized refresh, profile selection, logout, expiry | 3 |
| `backend/bob-gateway-client.test.cjs` | Gateway HTTP client: failure classification, model discovery, streaming, tenant routing, error sanitization | 4 |
| `backend/server-routes.test.cjs` | Live Express server on random port: all HTTP routes, auth token, workspace CRUD, session CRUD, chat validation, security headers | 18 |

**Backend total: 39 tests**

### Frontend / transport

| File | What it covers | Tests |
|---|---|---|
| `beta-api.test.mjs` | `api.ts` stream transport: auth token injection, SSE parsing, replace-text events, unexpected EOF, HTTP errors, stop/cancel flow | 4 |
| `model-picker.test.mjs` | `ModelPicker.tsx` pure functions: `providerName`, `label` for all gateway models, fallback behaviour, Sonnet version strings, picker search string | 9 |

**Frontend total: 13 tests**

---

## Grand total: 52 tests — all passing ✅

Last run: **2025-08-11**
Node version: **v25.2.1**

---

## What the server-routes tests cover in detail

The server route tests start the real Express app on a random loopback port
and issue real HTTP requests. They verify:

| Route | What is tested |
|---|---|
| `GET /api/local-auth` | Returns a token for loopback requests; rejects external origins with 403 |
| `GET /api/health` | Returns `{ status: "ok" }` with `bobBin` and `workspace` fields |
| `GET /api/modes` | Returns all 4 core modes (ask, agent, plan, code) with `id` and `label` |
| `GET /api/sessions` | Returns an array |
| `GET /api/sessions/:id` | Returns 404 for unknown session |
| `DELETE /api/sessions/:id` | Returns `{ ok: true }` even for nonexistent session |
| `GET /api/workspaces` | Returns at least one workspace with `id`, `name`, `path` |
| `POST /api/workspaces` | Creates a workspace inside `$HOME`; returns 201 with `id` and `name` |
| `GET /api/skills` | Returns an array |
| `GET /api/mcps` | Returns an array |
| `GET /api/gateway/auth/status` | Returns `{ connected: boolean, profiles: [] }` |
| `POST /api/gateway/auth/start` | Returns a URL or a proper error shape |
| `POST /api/chat` | Rejects invalid engine/model combinations (400) |
| `POST /api/chat` | Rejects unknown skill names (400) |
| `GET /api/files` | Rejects missing `path` parameter (400) |
| `GET /api/files` | Rejects path traversal attempts (403 or 404) |

---

## What the model-picker tests cover in detail

The model picker tests verify the two pure functions that drive the picker UI:

| Test | What is verified |
|---|---|
| `providerName` — known providers | `ibm-bob`, `openai`, `anthropic` each return the right display name |
| `providerName` — unknown | Falls back to the raw provider id |
| `providerName` — empty string | Falls back to `"Models"` |
| `label` — all 15 known models | Every model in the fallback catalog maps to a friendly name |
| `label` — live gateway catalog | All 13 models currently returned by the Bob gateway have friendly labels (regression guard — will catch any new model that ships without a label) |
| `label` — unknown model | Falls back to the raw name after the last `/` |
| `label` — Sonnet version strings | `premium` contains "4.5", `premium-ide` and `premium-shell` contain "4.6" |
| `label` — premium tiers distinct | `premium`, `premium-ide`, `premium-shell` all have different labels |
| Search string | The combined `providerName + label + id` string used by the picker filter includes "sonnet", "ibm bob", and "premium" for the premium model |

---

## Known limitations

- **Chat end-to-end**: The chat route (`POST /api/chat`) is not integration-tested
  because it requires a live Bob CLI process. The underlying streaming engine
  (`beta-runtime.cjs`) is fully unit-tested with a mock process.
- **IBMid OAuth end-to-end**: The `POST /api/gateway/auth/start` test accepts
  either a valid URL or a graceful error — it does not assert a successful
  OAuth round-trip, which would require a real IBMid session.
- **Frontend components**: React component rendering (Composer, ChatMessage,
  Sidebar, etc.) is not tested. The pure logic functions are tested via
  `model-picker.test.mjs` and `beta-api.test.mjs`.

---

## Adding new tests

- **Backend unit tests**: add a `.test.cjs` file in `backend/` and add it to
  the `scripts.test` entry in `backend/package.json`.
- **Frontend tests**: add a `.test.mjs` file at the repo root. These use
  native `node:test` + TypeScript transpilation via the same pattern as
  `beta-api.test.mjs`.
- **New gateway models**: if a new model appears in `opencode models ibm-bob`,
  add it to both `ModelPicker.tsx`'s `label()` map and the live catalog list
  in `model-picker.test.mjs`. The test will fail until both are updated —
  this is intentional.
