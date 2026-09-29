/**
 * server-routes.test.cjs
 * Integration tests for the bob-board backend HTTP routes.
 * Uses the exported Express app directly on a random port so the test
 * never conflicts with the running dev server on 3100.
 */
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const os     = require('node:os');
const fs     = require('node:fs');

// Point at a temp dir so tests never touch real data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-board-test-'));
process.env.BOB_WORKSPACE = tmpDir;
process.env.BOB_DB_PATH   = path.join(tmpDir, 'sessions.db');
process.env.BOB_HOME      = tmpDir;
process.env.NODE_ENV      = 'test';

const { app, closeDatabase } = require('./server.js');

let base, listener, token;

// ── helpers ──────────────────────────────────────────────────────────────────
async function req(method, path, body, tok) {
  const headers = { ...(tok ? { Authorization: `Bearer ${tok}`, Cookie: `bob_v3_local=${tok}` } : {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const get  = (p, t)    => req('GET',    p, null, t);
const post = (p, b, t) => req('POST',   p, b,    t);
const del  = (p, t)    => req('DELETE', p, null, t);

// ── lifecycle ────────────────────────────────────────────────────────────────
test('setup', async () => {
  listener = await new Promise(resolve => {
    const l = app.listen(0, '127.0.0.1', () => resolve(l));
  });
  base = `http://127.0.0.1:${listener.address().port}`;

  // Obtain a local auth token (loopback — no origin header needed)
  const res  = await fetch(`${base}/api/local-auth`);
  assert.equal(res.status, 200);
  const json = await res.json();
  token = json.token;
  assert.ok(typeof token === 'string' && token.length > 10, 'should receive a local auth token');
});

// ── /api/health ───────────────────────────────────────────────────────────────
test('GET /api/health returns status ok with expected fields', async () => {
  const { status, body } = await get('/api/health', token);
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok('bobBin'    in body, 'health should include bobBin');
  assert.ok('workspace' in body, 'health should include workspace');
  assert.ok('bffShim'   in body, 'health should include bffShim');
});

// ── /api/modes ────────────────────────────────────────────────────────────────
test('GET /api/modes returns all core modes with id and label', async () => {
  const { status, body } = await get('/api/modes', token);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  const ids = body.map(m => m.id);
  for (const expected of ['ask', 'agent', 'plan', 'code']) {
    assert.ok(ids.includes(expected), `modes should include "${expected}"`);
  }
  for (const mode of body) {
    assert.ok(typeof mode.id    === 'string' && mode.id.length,    `mode.id must be non-empty string`);
    assert.ok(typeof mode.label === 'string' && mode.label.length, `mode.label must be non-empty string`);
  }
});

// ── /api/sessions ─────────────────────────────────────────────────────────────
test('GET /api/sessions returns an array', async () => {
  const { status, body } = await get('/api/sessions', token);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});

test('GET /api/sessions/:id returns 404 for unknown session', async () => {
  const { status } = await get('/api/sessions/nonexistent-xyz', token);
  assert.equal(status, 404);
});

test('DELETE /api/sessions/:id on nonexistent session still returns ok', async () => {
  const { status, body } = await del('/api/sessions/no-such-session', token);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

// ── /api/workspaces ───────────────────────────────────────────────────────────
test('GET /api/workspaces returns array with at least one workspace', async () => {
  const { status, body } = await get('/api/workspaces', token);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body) && body.length >= 1);
  const ws = body[0];
  assert.ok(typeof ws.id   === 'string', 'workspace.id must be a string');
  assert.ok(typeof ws.name === 'string', 'workspace.name must be a string');
  assert.ok(typeof ws.path === 'string', 'workspace.path must be a string');
});

test('POST /api/workspaces creates a new workspace inside HOME', async () => {
  // The server requires the path to be inside $HOME
  const newPath = fs.mkdtempSync(path.join(os.homedir(), 'bob-ws-test-'));
  try {
    const { status, body } = await post('/api/workspaces', { name: 'test-ws', path: newPath }, token);
    assert.equal(status, 201);
    assert.ok(typeof body.id === 'string');
    assert.equal(body.name, 'test-ws');
  } finally {
    fs.rmSync(newPath, { recursive: true, force: true });
  }
});

// ── /api/skills & /api/mcps ───────────────────────────────────────────────────
test('GET /api/skills returns an array', async () => {
  const { status, body } = await get('/api/skills', token);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});

test('GET /api/mcps returns an array', async () => {
  const { status, body } = await get('/api/mcps', token);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});

// ── /api/gateway ──────────────────────────────────────────────────────────────
test('GET /api/gateway/auth/status returns connected boolean and profiles array', async () => {
  const { status, body } = await get('/api/gateway/auth/status', token);
  assert.equal(status, 200);
  assert.ok(typeof body.connected === 'boolean');
  assert.ok(Array.isArray(body.profiles));
});

test('POST /api/gateway/auth/start returns a URL or a proper error', async () => {
  const { status, body } = await post('/api/gateway/auth/start', {}, token);
  if (status === 200) {
    assert.ok(typeof body.url === 'string' && body.url.startsWith('https://'));
  } else {
    assert.ok(typeof body.error === 'string', 'non-200 should return error string');
  }
});

// ── /api/chat validation ──────────────────────────────────────────────────────
test('POST /api/chat rejects invalid engine/model combination', async () => {
  const { status, body } = await post('/api/chat', { message: 'hi', mode: 'ask', engine: 'opencode', model: 'bad-model' }, token);
  assert.equal(status, 400);
  assert.ok(typeof body.error === 'string');
});

test('POST /api/chat rejects unknown skill', async () => {
  const { status, body } = await post('/api/chat', { message: 'hi', mode: 'ask', engine: 'bob', skill: 'nonexistent-skill-xyz' }, token);
  assert.equal(status, 400);
  assert.match(body.error, /skill/i);
});

// ── /api/local-auth security ──────────────────────────────────────────────────
test('GET /api/local-auth rejects requests from non-loopback origins', async () => {
  const res = await fetch(`${base}/api/local-auth`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(res.status, 403);
});

// ── /api/files validation ─────────────────────────────────────────────────────
test('GET /api/files rejects missing path parameter', async () => {
  const { body: wsList } = await get('/api/workspaces', token);
  const wsId = wsList[0]?.id;
  const { status } = await get(`/api/files?workspaceId=${wsId}`, token);
  assert.equal(status, 400);
});

test('GET /api/files rejects path traversal attempts', async () => {
  const { body: wsList } = await get('/api/workspaces', token);
  const wsId = wsList[0]?.id;
  const { status } = await get(`/api/files?workspaceId=${wsId}&path=../../etc/passwd`, token);
  // Server resolves the real path and rejects anything outside the workspace root;
  // the tmpdir workspace has no real files, so it resolves to ENOENT (404) or
  // a symlink-escape 403 depending on OS — either is a rejection.
  assert.ok([403, 404].includes(status), `expected 403 or 404 for path traversal, got ${status}`);
});

// ── teardown ──────────────────────────────────────────────────────────────────
test('teardown', async () => {
  await new Promise(resolve => listener.close(resolve));
  closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // Express 5 keeps an internal keep-alive ref that prevents the event loop
  // from draining naturally. Force exit after all tests complete.
  setImmediate(() => process.exit(0));
});
