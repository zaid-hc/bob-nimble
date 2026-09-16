import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the real TypeScript transport with a mocked local service; no Bob calls.
const source = fs.readFileSync(new URL('./src/api.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
async function transport(fetchMock) {
  globalThis.window = { location: { protocol: 'http:', hostname: 'localhost' } };
  globalThis.fetch = fetchMock;
  return import(`data:text/javascript;base64,${Buffer.from(`${code}\n// ${Math.random()}`).toString('base64')}`);
}
const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const auth = () => Response.json({ token: 'test-only' });
function callbacks(resolve, overrides = {}) {
  return { message: 'hello', mode: 'ask', onActivity() {}, onToolCall() {}, onUsage() {}, onText() {}, onDone: (...args) => resolve({ done: args }), onError: message => resolve({ error: message }), ...overrides };
}

test('sends authenticated attachments and preserves replacement events', async () => {
  const texts = [];
  const { streamChat } = await transport(async (url, options) => {
    if (url === '/api/local-auth') return auth();
    assert.equal(options.headers.get('Authorization'), 'Bearer test-only');
    const body = JSON.parse(options.body);
    assert.equal(body.attachments[0].name, 'example.log');
    assert.equal(body.automaticActions, false);
    return new Response(event('session', { sessionId: 's' }) + event('text', { text: 'draft' }) + event('replace_text', { text: 'final' }) + event('done', { sessionId: 's', exitCode: 0, status: 'completed' }));
  });
  const result = await new Promise(resolve => streamChat(callbacks(resolve, { attachments: [{ id: 'a', name: 'example.log' }], onText: (...args) => texts.push(args) })));
  assert.equal(result.done[2], 'completed');
  assert.deepEqual(texts, [['draft', 's', false], ['final', 's', true]]);
});

test('unexpected EOF is an error, not a successful completion', async () => {
  const { streamChat } = await transport(async url => url === '/api/local-auth' ? auth() : new Response(event('text', { text: 'partial' })));
  const result = await new Promise(resolve => streamChat(callbacks(resolve)));
  assert.match(result.error, /before Bob confirmed/);
});

test('HTTP error explains the backend failure', async () => {
  const { streamChat } = await transport(async url => url === '/api/local-auth' ? auth() : Response.json({ error: 'Workspace mismatch' }, { status: 409 }));
  const result = await new Promise(resolve => streamChat(callbacks(resolve)));
  assert.equal(result.error, 'Workspace mismatch');
});

test('Stop requests cancellation and waits for the terminal event', async () => {
  let sink;
  let cancelRequested = false;
  const encoder = new TextEncoder();
  const { streamChat } = await transport(async url => {
    if (url === '/api/local-auth') return auth();
    if (url.endsWith('/cancel')) {
      cancelRequested = true;
      sink.enqueue(encoder.encode(event('done', { sessionId: 's', exitCode: 1, status: 'cancelled' })));
      sink.close();
      return Response.json({ status: 'cancelling' }, { status: 202 });
    }
    return new Response(new ReadableStream({ start(controller) { sink = controller; controller.enqueue(encoder.encode(event('text', { text: 'partial' }))); } }));
  });
  let stop;
  const result = await new Promise(resolve => { stop = streamChat(callbacks(resolve, { onText() { stop(); } })); });
  assert.ok(cancelRequested);
  assert.equal(result.done[2], 'cancelled');
});
