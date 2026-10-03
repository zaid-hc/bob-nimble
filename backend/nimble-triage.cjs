'use strict';
/**
 * Nimble triage — local pre-flight router using Ollama's /v1/systemone endpoint.
 *
 * Before a message reaches IBM Bob, Nimble reads it and answers:
 *   - Which skill fits best?
 *   - Which MCP servers are relevant?
 *   - Rough urgency?
 *
 * This lets the caller pre-select the right skill and trim the MCP list,
 * so Bob's context window starts focused — fewer tool calls, less noise.
 *
 * Requirements:
 *   - Ollama 0.35+ running locally (http://localhost:11434)
 *   - `ollama pull nimble` done once
 *
 * Falls back silently if Ollama is unreachable or the model is not installed.
 */

const http = require('node:http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const NIMBLE_MODEL = process.env.NIMBLE_MODEL || 'nimble';
const TRIAGE_TIMEOUT_MS = Number(process.env.NIMBLE_TIMEOUT_MS) || 3000;

// All skills that can be pre-selected
const SKILLS = {
  'secure-support-engineer': 'Vault or Boundary error, seal, unseal, auth, PKI, replication, namespace, raft, audit, lease, token, AppRole, Kubernetes auth',
  'consul-support-engineer': 'Consul service mesh, ACL, gossip protocol, DNS resolution, WAN federation, mesh gateway, transparent proxy, intentions, dataplane',
  'reproduce-issue': 'Customer wants to reproduce a bug, set up a test environment, or needs a repro script',
  'terraform': 'Terraform HCL configuration, state management, provider plugin, module, plan/apply error',
  'github-cli': 'GitHub repository, pull request, issue, branch, workflow, Actions, releases',
  'general': 'General question, how-to, concept explanation — does not clearly map to a specific product',
};

// MCP servers that can be suggested
const MCPS = {
  'vault-support-mcp':              'Vault open-source documentation and known issues',
  'vault-enterprise-support-mcp':   'Vault Enterprise, HCP Vault, namespaces, DR/performance replication',
  'boundary-support-mcp':           'Boundary workers, sessions, credential brokering',
  'consul-support-mcp':             'Consul service mesh, ACL, gossip, DNS, federation',
  'terraform-support-mcp':          'Terraform language, providers, state, modules',
  'kubernetes-support-mcp':         'Kubernetes, Helm, kubectl, cert-manager, Vault Agent injector',
  'aws-support-mcp':                'AWS, EKS, IRSA, IAM',
  'azure-support-mcp':              'Azure, AKS, Entra ID, Azure Key Vault',
  'gcp-support-mcp':                'GCP, GKE, Workload Identity',
  'pki-support-mcp':                'PKI, TLS certificates, ACME, SPIFFE/SPIRE, cert-manager',
  'ldap-ad-support-mcp':            'LDAP, Active Directory, FreeIPA',
  'observability-support-mcp':      'Prometheus, Grafana, OpenTelemetry, Loki, Datadog',
};

/**
 * POST to Ollama's /v1/systemone with a timeout.
 * Returns the parsed JSON response body or throws on error/timeout.
 */
function systemone(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL('/v1/systemone', OLLAMA_HOST);
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`Ollama /v1/systemone returned ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON from Ollama')); }
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(new Error('Nimble triage timed out')); }, TRIAGE_TIMEOUT_MS);
    req.on('close', () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

/**
 * Run Nimble triage on a support message.
 *
 * @param {string} message  - The user's message text
 * @returns {Promise<{skill: string|null, mcps: string[], urgency: number, confidence: number, durationMs: number} | null>}
 *   Returns null if Ollama is unavailable or Nimble is not installed — caller should proceed without triage.
 */
async function triage(message) {
  const start = Date.now();
  const text = message.trim().slice(0, 4000); // Nimble's context is 8192 tokens; cap input for speed

  // Build MCP questions — one per server to keep it parallelisable inside Nimble
  const mcpQuestions = Object.fromEntries(
    Object.entries(MCPS).map(([name, desc]) => [
      name,
      { type: 'noul', instructions: `Is this MCP server relevant to the question? Server purpose: ${desc}` },
    ])
  );

  const payload = {
    model: NIMBLE_MODEL,
    state: { ticket: text },
    questions: {
      skill: {
        type: 'choice',
        instructions: 'Which Bob skill best fits this support request?',
        criteria: SKILLS,
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this ticket based on the described impact?',
        criteria: ['Low — question or general guidance', 'Medium — partial degradation or workaround available', 'High — production outage or data at risk'],
      },
      ...mcpQuestions,
    },
  };

  let response;
  try {
    response = await systemone(payload);
  } catch {
    // Ollama not running or Nimble not installed — silent fallback
    return null;
  }

  const answers = response?.answers;
  if (!answers) return null;

  const skill = answers.skill?.choice ?? null;
  const skillConfidence = answers.skill?.confidence ?? 0;
  const urgency = answers.urgency?.score ?? 0;

  // Collect MCP servers where Nimble says they are relevant (noul > 0.6 threshold)
  const mcps = Object.keys(MCPS).filter(name => (answers[name]?.noul ?? 0) > 0.6);

  return {
    skill: skillConfidence > 0.55 ? skill : null, // only suggest if reasonably confident
    mcps,
    urgency,
    confidence: skillConfidence,
    durationMs: Date.now() - start,
  };
}

/**
 * Check whether the Nimble model is available in Ollama.
 * Returns { available: boolean, ollamaRunning: boolean }.
 */
async function checkAvailability() {
  try {
    const url = new URL('/api/tags', OLLAMA_HOST);
    const response = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: url.hostname, port: url.port || 80, path: url.pathname }, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); } });
      });
      req.on('error', reject);
      req.setTimeout(1500, () => req.destroy(new Error('timeout')));
    });
    const models = (response?.models ?? []).map(m => m.name);
    const available = models.some(name => name === NIMBLE_MODEL || name.startsWith(`${NIMBLE_MODEL}:`));
    return { available, ollamaRunning: true, models };
  } catch {
    return { available: false, ollamaRunning: false, models: [] };
  }
}

module.exports = { triage, checkAvailability };
