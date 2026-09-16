'use strict';
// Direct HTTP transport. Deliberately not wired into chat until independent
// sign-in/profile selection and the tool execution loop are implemented.
const DEFAULT_ORIGIN = 'https://api.us-east.bob.ibm.com';
async function failureCategory(response) {
  // Inspect only a bounded prefix in memory; never return or log its contents.
  const reader = response.body?.getReader();
  let text = '', size = 0, timer;
  if (reader) {
    try {
      await Promise.race([
        (async () => { const decoder = new TextDecoder(); while (size < 16384) { const part = await reader.read(); if (part.done) break; const bytes = part.value.subarray(0, 16384 - size); size += bytes.length; text += decoder.decode(bytes, { stream: true }); } })(),
        new Promise(resolve => { timer = setTimeout(resolve, 2000); }),
      ]);
    } catch {} finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
  }
  if (response.headers.get('cf-mitigated') === 'challenge' || /cf-chl-|cloudflare.*(?:blocked|challenge)|attention required.*cloudflare/i.test(text)) return 'edge-challenge';
  if (/insufficient[_ -]scope|missing[_ -]scope/i.test(text)) return 'scope';
  if (/(?:model|catalog).{0,60}(?:not allowed|not authorized|access denied)/i.test(text)) return 'catalog-access';
  if (/(?:instance|team|tenant).{0,60}(?:invalid|forbidden|not found|denied)/i.test(text)) return 'profile-access';
  if (/token.{0,30}(?:expired|invalid)|invalid_token/i.test(text)) return 'token';
  if (/application\/json/i.test(response.headers.get('content-type') || '')) return 'gateway-json';
  if (/text\/html/i.test(response.headers.get('content-type') || '')) return 'html-response';
  return 'unclassified';
}
function createGatewayClient({ getAuthorization, fetchImpl = fetch, origin = DEFAULT_ORIGIN }) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || !/^api\.[a-z0-9-]+\.bob\.ibm\.com$/.test(base.hostname) || base.port || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid Bob Gateway origin.');
  async function request(route, body, signal) {
    const auth = await getAuthorization();
    if (!auth || !['Bearer', 'Apikey'].includes(auth.scheme) || typeof auth.credential !== 'string' || !auth.credential || /[\r\n]/.test(auth.credential)) throw new Error('Bob sign-in is required.');
    // Fail closed: never guess a tenant, team, or region from another account.
    if (!auth.instanceID || !auth.teamID) throw new Error('Select your Bob instance and team before continuing.');
    const headers = { Authorization: `${auth.scheme} ${auth.credential}`, 'Content-Type': 'application/json', 'User-Agent': 'ibm-bob-gateway-plugin', 'x-instance-id': auth.instanceID, 'x-team-id': auth.teamID };
    let response;
    try {
      response = await fetchImpl(`${base.origin}/inference/v1/${route}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
    } catch {
      throw new Error(signal?.aborted ? 'Bob request cancelled.' : 'Could not reach Bob Gateway.');
    }
    if (!response.ok) {
      // Never forward upstream response bodies, request headers or credentials.
      const category = await failureCategory(response);
      const explanation = { 'edge-challenge': 'An edge security challenge or block was detected. Contact the Gateway administrator; no bypass was attempted.', scope: 'The response indicates a missing authorization scope.', 'catalog-access': 'The response indicates restricted model or catalog access.', 'profile-access': 'The response indicates a profile routing or permission problem.', token: 'The response indicates an invalid or expired token.', 'gateway-json': 'The service returned a JSON error; its private details were withheld.', 'html-response': 'The service returned an HTML error rather than a catalog.', unclassified: 'The response did not identify a recognized cause.' }[category];
      const ray = response.headers.get('cf-ray');
      const reference = ray && /^[a-f0-9]{12,32}-[A-Z]{3}$/i.test(ray) ? ` Edge reference: ${ray}.` : '';
      const error = new Error(`Bob Gateway ${route} failed (HTTP ${response.status}; ${category}). ${explanation}${reference}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  return {
    async models(signal) {
      const response = await request('model/info', null, signal);
      let json; try { json = await response.json(); } catch { throw new Error('Bob Gateway returned an invalid model catalog.'); }
      if (!Array.isArray(json.data)) throw new Error('Bob Gateway returned an invalid model catalog.');
      return [...new Set(json.data.map(item => item.model_name).filter(name => typeof name === 'string' && /^[\w./:-]+$/.test(name)))];
    },
    stream({ model, messages, tools, signal }) {
      if (typeof model !== 'string' || !model.startsWith('ibm-bob/') || !/^[\w./:-]+$/.test(model)) throw new Error('Choose a Bob Gateway model.');
      if (!Array.isArray(messages) || !messages.length) throw new Error('Messages are required.');
      return request('chat/completions', { model: model.slice('ibm-bob/'.length), messages, stream: true, ...(tools?.length ? { tools } : {}) }, signal);
    },
  };
}
module.exports = { createGatewayClient, failureCategory };
