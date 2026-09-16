const test = require('node:test');
const assert = require('node:assert/strict');
const { createGatewayClient } = require('./bob-gateway-client.cjs');
const { failureCategory } = require('./bob-gateway-client.cjs');
test('diagnostics classify responses without disclosing private contents', async () => {
  assert.equal(await failureCategory(new Response('private value', { headers: { 'cf-mitigated': 'challenge' } })), 'edge-challenge');
  assert.equal(await failureCategory(Response.json({ error: 'insufficient_scope', token: 'secret' })), 'scope');
  const client = createGatewayClient({ getAuthorization: async () => ({ scheme: 'Bearer', credential: 'secret', instanceID: 'i', teamID: 't' }), fetchImpl: async () => Response.json({ error: 'insufficient_scope', token: 'secret' }, { status: 403 }) });
  await assert.rejects(client.models(), error => error.message.includes('scope') && !error.message.includes('secret'));
});
const authorization = async () => ({ scheme: 'Bearer', credential: 'synthetic-test-token', instanceID: 'test-instance', teamID: 'test-team' });
test('direct model discovery uses Bob endpoint and explicit tenant', async () => {
  const client = createGatewayClient({ getAuthorization: authorization, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.us-east.bob.ibm.com/inference/v1/model/info');
    assert.equal(init.headers['x-team-id'], 'test-team');
    assert.equal(init.redirect, 'error');
    return Response.json({ data: [{ model_name: 'fast' }, { model_name: 'fast' }, {}] });
  } });
  assert.deepEqual(await client.models(), ['fast']);
});
test('stream preserves messages/tools and rejects other providers', async () => {
  const client = createGatewayClient({ getAuthorization: authorization, fetchImpl: async (url, init) => {
    assert.ok(url.endsWith('/chat/completions'));
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'fast'); assert.equal(body.stream, true); assert.equal(body.tools.length, 1);
    return new Response('data: [DONE]\n\n');
  } });
  assert.throws(() => client.stream({ model: 'openai/test', messages: [{}] }), /Bob Gateway model/);
  assert.equal(await (await client.stream({ model: 'ibm-bob/fast', messages: [{ role: 'user', content: 'test' }], tools: [{}] })).text(), 'data: [DONE]\n\n');
});
test('missing tenant fails before network and upstream errors are sanitized', async () => {
  let calls = 0;
  const client = createGatewayClient({ getAuthorization: async () => ({ scheme: 'Bearer', credential: 'test' }), fetchImpl: async () => { calls++; } });
  await assert.rejects(client.models(), /instance and team/); assert.equal(calls, 0);
  const denied = createGatewayClient({ getAuthorization: authorization, fetchImpl: async () => new Response('secret upstream detail', { status: 403 }) });
  await assert.rejects(denied.models(), error => error.status === 403 && !error.message.includes('secret'));
  assert.throws(() => createGatewayClient({ origin: 'https://example.com', getAuthorization: authorization }), /origin/);
});
