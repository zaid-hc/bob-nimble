const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configFor } = require('./opencode-adapter.cjs');
test('selected MCPs are translated; unselected servers disabled; standard writes denied', () => {
  const raw = { mcpServers: { vault: { command: 'node', args: ['server.js'], env: { TOKEN: '${TOKEN}' }, alwaysAllow: ['search_docs'] }, other: { command: 'other' } } };
  const config = configFor(raw, ['vault'], false, { TOKEN: 'test-only' });
  assert.deepEqual(config.mcp.vault.command, ['node','server.js']);
  assert.equal(config.mcp.other.enabled, false);
  assert.equal(config.permission.vault_search_docs, 'allow');
  assert.equal(config.permission['*'], 'deny');
  assert.equal(config.permission.edit, 'deny');
  assert.equal(config.permission.bash, 'deny');
  assert.equal(config.permission.task, 'deny');
  assert.equal(config.share, 'disabled');
});
test('automatic permission only enables selected MCPs and native write tools', () => {
  const config = configFor({mcpServers:{vault:{command:'node'}}}, ['vault'], true);
  assert.equal(config.permission['vault_*'],'allow');
  assert.equal(config.permission['*'],'deny');
  assert.equal(config.permission.edit,'allow');
  assert.equal(config.permission.task,'deny');
});
test('missing env, disabled server, and unknown server fail explicitly', () => {
  assert.throws(() => configFor({mcpServers:{x:{command:'node',env:{T:'${MISSING}'}}}},['x'],false,{}), /MISSING/);
  assert.throws(() => configFor({mcpServers:{x:{disabled:true}}},['x'],false), /disabled/);
  assert.throws(() => configFor({mcpServers:{}},['x'],false), /unavailable/);
});
