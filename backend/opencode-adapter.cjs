'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const BIN = process.env.OPENCODE_BIN || path.join(os.homedir(), '.opencode', 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode');
let catalog;
let catalogTime = 0;
const MODEL_ID = /^ibm-bob\/[\w./:-]+$/;
function cli(args) {
  return new Promise((resolve, reject) => execFile(BIN, args, { timeout: 20000, maxBuffer: 500000 }, (error, stdout) => error ? reject(new Error('Cannot list OpenCode models. Check local provider connections.')) : resolve(stdout)));
}
function models() {
  if (!catalog || Date.now() - catalogTime > 60000) {
    catalogTime = Date.now();
    catalog = cli(['models', 'ibm-bob']).then(output => {
      const result = [...new Set(output.split(/\r?\n/).map(id => id.trim()).filter(id => MODEL_ID.test(id)))];
      if (!result.length) throw new Error('No models found for connected providers. Connect a provider in OpenCode first.');
      return result;
    }).catch(error => { catalog = undefined; throw error; });
  }
  return catalog;
}
function expand(value, env) {
  if (typeof value !== 'string') throw new Error('MCP settings must contain strings.');
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, a, b) => {
    const key = a || b;
    if (!env[key]) throw new Error(`MCP environment variable ${key} is not available to the V3 backend.`);
    return env[key];
  });
}
function configFor(raw, selected, automatic, env = process.env) {
  const all = raw.mcpServers || {};
  const mcp = Object.fromEntries(Object.keys(all).map(name => [name, { enabled: false }]));
  const permission = { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow', edit: automatic ? 'allow' : 'deny', bash: automatic ? 'allow' : 'deny', external_directory: 'deny', task: 'deny', question: 'deny', skill: 'deny' };
  for (const name of [...new Set(selected)]) {
    const item = all[name];
    if (!/^[\w-]+$/.test(name) || !item || item.disabled) throw new Error(`MCP ${name} is unavailable or disabled.`);
    if (typeof item.command === 'string') {
      if (item.args && (!Array.isArray(item.args) || item.args.some(v => typeof v !== 'string'))) throw new Error(`Invalid arguments for MCP ${name}.`);
      mcp[name] = { type: 'local', command: [expand(item.command, env), ...(item.args || []).map(v => expand(v, env))], environment: Object.fromEntries(Object.entries(item.env || {}).map(([k, v]) => [k, expand(v, env)])), enabled: true, timeout: 20000 };
    } else if (typeof item.url === 'string') {
      const url = expand(item.url, env);
      if (!/^https?:\/\//.test(url)) throw new Error(`Unsupported URL for MCP ${name}.`);
      mcp[name] = { type: 'remote', url, headers: Object.fromEntries(Object.entries(item.headers || {}).map(([k,v]) => [k,expand(v,env)])), enabled: true, timeout: 20000 };
    } else throw new Error(`Unsupported configuration for MCP ${name}.`);
    // Only explicitly selected MCPs can be approved. Standard mode carries over
    // the user's existing per-tool preapprovals, never an all-tools allowance.
    const prefixes = new Set([name, name.replace(/-/g, '_')]);
    for (const prefix of prefixes) {
      if (automatic) permission[`${prefix}_*`] = 'allow';
      else for (const tool of item.alwaysAllow || []) {
        if (typeof tool === 'string' && /^[\w-]+$/.test(tool)) permission[`${prefix}_${tool}`] = 'allow';
      }
    }
  }
  return { mcp, share: 'disabled', permission, agent: { 'secure-support-v3': {
    mode: 'primary', description: 'Secure Support dashboard agent', permission, steps: 12,
    prompt: 'Work on the current support request. Follow the selected skill instructions. Never claim to have retrieved a source or written a file unless the corresponding tool succeeded. Explain permission or unavailable-tool limitations. Do not invent results. Do not delegate to other agents.',
  } } };
}
async function prepare({ bobHome, selected, model, automatic, prompt, skill, cwd }) {
  if (!(await models()).includes(model)) throw new Error('The selected Bob model is not available. Refresh the model list.');
  const file = path.join(bobHome, 'settings', 'mcp.json');
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { mcpServers: {} };
  const config = configFor(raw, selected, automatic);
  if (skill) config.agent['secure-support-v3'].permission.external_directory = { '*': 'deny', [path.join(bobHome, 'skills', skill, '*')]: 'allow' };
  return { bin: BIN, args: ['run', '--dir', cwd, '--model', model, '--agent', 'secure-support-v3', '--format', 'json'],
    env: { ...process.env, PWD: cwd, BOB_FEEDBACK_THRESHOLD: String(-Number.MAX_VALUE), OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }, stdin: `Selected workspace: ${cwd}. Resolve relative attachment and output paths against this exact directory. Requested mode: ${automatic ? 'automatic actions explicitly approved' : 'standard permissions'}.\n\n${prompt}` };
}
module.exports = { models, prepare, configFor };
