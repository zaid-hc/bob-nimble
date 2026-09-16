'use strict';
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { createServer } = require('node:http');
const ORIGIN = 'https://api.us-east.bob.ibm.com';
function profilesFrom(json) {
  if (!Array.isArray(json?.instances)) throw new Error('Bob returned an invalid profile list.');
  const rows = [];
  for (const instance of json.instances) for (const team of instance.teams || []) {
    if (![instance.instance_id, team.id].every(id => typeof id === 'string' && id && !/[\r\n]/.test(id))) continue;
    const domain = typeof instance.region_domain === 'string' ? instance.region_domain.toLowerCase().replace(/\.$/, '') : '';
    const host = domain.startsWith('api.') ? domain : `api.${domain}`;
    if (typeof host !== 'string' || !/^api\.[a-z0-9-]+\.bob\.ibm\.com$/.test(host)) continue;
    rows.push({ instanceID: instance.instance_id, teamID: team.id, origin: `https://${host}`, label: `${instance.name || instance.instance_id} / ${team.name || team.id}` });
  }
  return rows;
}
function createBobAuth({ fetchImpl = fetch, now = Date.now } = {}) {
  let credentials, profiles = [], selected, pending, refreshPromise, generation = 0, error = '';
  async function json(route, body, access) {
    let response;
    try { response = await fetchImpl(ORIGIN + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ibm-bob-gateway-plugin', ...(access ? { Authorization: `Bearer ${access}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error' }); }
    catch { throw new Error('Could not reach Bob sign-in. Please retry.'); }
    if (!response.ok) throw new Error(`Bob sign-in request failed (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Bob returned an invalid sign-in response.'); }
  }
  function token(data) {
    const access = data.token || data.access_token;
    if (typeof access !== 'string' || !access || typeof data.refresh_token !== 'string' || !data.refresh_token) throw new Error('Bob did not return valid credentials.');
    let expires = now() + (Number.isFinite(data.expires_in) ? data.expires_in : 28800) * 1000;
    try { const exp = JSON.parse(Buffer.from(access.split('.')[1], 'base64url')).exp; if (typeof exp === 'number') expires = exp * 1000; } catch {}
    return { access, refresh: data.refresh_token, expires };
  }
  function clearPending() { if (pending) { clearTimeout(pending.timer); pending.server.close(); pending = undefined; } }
  function status() { return { connected: !!credentials, pending: !!pending, profiles, selected: selected || null, error, memoryOnly: true }; }
  async function accept(state, code) {
    const transaction = pending;
    if (!transaction || now() > transaction.deadline || typeof state !== 'string' || Buffer.byteLength(state) !== Buffer.byteLength(transaction.state) || !timingSafeEqual(Buffer.from(state), Buffer.from(transaction.state))) throw new Error('Invalid or expired sign-in state.');
    if (typeof code !== 'string' || !code || code.length > 8192) throw new Error('Missing or invalid authorization code.');
    const expectedGeneration = generation;
    clearPending(); // Consume state before exchanging the one-time code.
    try {
      const next = token(await json('/authn/v1/auth/token', { code }));
      const choices = profilesFrom(await json('/admin/v1/profile', null, next.access));
      if (generation !== expectedGeneration) throw new Error('Sign-in was cancelled.');
      credentials = next; profiles = choices; selected = undefined; error = '';
    } catch (failure) { if (generation === expectedGeneration) error = failure.message; throw failure; }
  }
  async function start() {
    generation++; const expectedGeneration = generation; clearPending(); error = '';
    const state = '/' + randomBytes(32).toString('hex');
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${server.address()?.port}` || url.pathname !== '/bob-shell-auth-callback') { res.writeHead(404); res.end('Not found'); return; }
      try { await accept(url.searchParams.get('state'), url.searchParams.get('code')); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bob sign-in complete. Return to V3 and select your instance and team. You can close this tab.'); }
      catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Sign-in failed or expired. Return to V3 and retry.'); }
    });
    await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('Could not open the local sign-in callback.'))); server.listen(0, '127.0.0.1', resolve); });
    if (generation !== expectedGeneration) { server.close(); throw new Error('Sign-in cancelled.'); }
    pending = { state, server, deadline: now() + 180000, timer: setTimeout(() => { clearPending(); error = 'Sign-in timed out. Please retry.'; }, 180000) };
    pending.timer.unref();
    const redirect = `http://127.0.0.1:${server.address().port}/bob-shell-auth-callback`;
    try {
      const login = await json('/authn/v1/auth/login?' + new URLSearchParams({ redirect_uri: redirect, response_mode: 'query', state }));
      const url = new URL(login.redirect_url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Bob returned an invalid login URL.');
      if (generation !== expectedGeneration) throw new Error('Sign-in cancelled.');
      return { url: url.href };
    } catch (failure) { if (generation === expectedGeneration) { clearPending(); error = failure.message; } throw failure; }
  }
  function select(instanceID, teamID) {
    if (!credentials) throw new Error('Sign in to Bob first.');
    const choice = profiles.find(item => item.instanceID === instanceID && item.teamID === teamID);
    if (!choice) throw new Error('Choose a returned Bob instance and team.');
    selected = choice; return status();
  }
  async function authorization() {
    if (!credentials || !selected) throw new Error('Sign in and select a Bob instance and team.');
    if (credentials.expires < now() + 60000) {
      if (!refreshPromise) { const currentGeneration = generation; const refresh = credentials.refresh;
        refreshPromise = json('/authn/v1/auth/refresh', { refresh_token: refresh }).then(data => { if (generation !== currentGeneration) throw new Error('Sign-in changed.'); credentials = token(data); }).catch(failure => { if (generation === currentGeneration) { credentials = undefined; selected = undefined; profiles = []; error = 'Bob sign-in expired. Reconnect IBMid.'; } throw failure; }).finally(() => { refreshPromise = undefined; });
      }
      await refreshPromise;
    }
    return { scheme: 'Bearer', credential: credentials.access, ...selected };
  }
  function logout() { generation++; clearPending(); credentials = undefined; selected = undefined; profiles = []; error = ''; return status(); }
  return { start, accept, status, select, authorization, logout };
}
module.exports = { createBobAuth, profilesFrom };
