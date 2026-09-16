const test = require('node:test');
const assert = require('node:assert/strict');
const { createBobAuth, profilesFrom } = require('./bob-gateway-auth.cjs');
const profile = { instances: [{ instance_id: 'instance', region_domain: 'us-east.bob.ibm.com', teams: [{ id: 'team' }] }] };
test('reject untrusted routing and normalize Bob region', () => {
  assert.equal(profilesFrom(profile)[0].origin, 'https://api.us-east.bob.ibm.com');
  assert.deepEqual(profilesFrom({ instances: [{ instance_id: 'i', region_domain: 'evil.example', teams: [{ id: 't' }] }] }), []);
});
test('one-time state, explicit profile, serialized refresh, and logout', async () => {
  let state, refreshes = 0, time = Date.now();
  const auth = createBobAuth({ now: () => time, fetchImpl: async (url, init) => {
    if (url.includes('/auth/login')) { state = new URL(url).searchParams.get('state'); return Response.json({ redirect_url: 'https://login.ibm.com/example' }); }
    if (url.endsWith('/auth/token')) return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 120 });
    if (url.endsWith('/profile')) return Response.json(profile);
    if (url.endsWith('/auth/refresh')) { refreshes++; return Response.json({ access_token: 'new-test-token', refresh_token: 'rotated-test-refresh', expires_in: 3600 }); }
    throw new Error('Unexpected request');
  } });
  try {
    await auth.start();
    await assert.rejects(auth.accept('wrong', 'test-code'), /state/);
    await auth.accept(state, 'test-code');
    await assert.rejects(auth.accept(state, 'test-code'), /state/);
    assert.equal(JSON.stringify(auth.status()).includes('synthetic-access'), false);
    await assert.rejects(auth.authorization(), /select/);
    assert.throws(() => auth.select('wrong', 'team'), /returned/);
    auth.select('instance', 'team');
    time += 90000;
    const result = await Promise.all([auth.authorization(), auth.authorization()]);
    assert.equal(refreshes, 1); assert.equal(result[0].credential, 'new-test-token');
    auth.logout(); await assert.rejects(auth.authorization(), /Sign in/);
  } finally { auth.logout(); }
});
test('expired transaction cannot exchange a code', async () => {
  let time = Date.now(), state;
  const auth = createBobAuth({ now: () => time, fetchImpl: async url => { state = new URL(url).searchParams.get('state'); return Response.json({ redirect_url: 'https://login.ibm.com/example' }); } });
  try { await auth.start(); time += 180001; await assert.rejects(auth.accept(state, 'test'), /expired/); } finally { auth.logout(); }
});
