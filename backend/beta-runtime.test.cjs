const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateAttachment, exactFile, extractText, chatArgs, startChatRun } = require('./beta-runtime.cjs');

test('attachments enforce type, size, encoding and filename', () => {
  validateAttachment('main.tf', Buffer.from('resource "x" "y" {}'));
  for (const [name, data] of [['image.png', Buffer.from('image')], ['../a.txt', Buffer.from('text')], ['a.txt', Buffer.from([0])], ['a.txt', Buffer.from([255])], ['a.txt', Buffer.alloc(15 * 1024 * 1024 + 1)]]) {
    assert.throws(() => validateAttachment(name, data));
  }
});

test('exact paths never substitute a nested same-name file or escape through symlinks', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-path-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scenario'));
  fs.writeFileSync(path.join(root, 'scenario/main.tf'), 'correct');
  assert.throws(() => exactFile(root, 'main.tf'), { code: 'ENOENT' });
  assert.equal(fs.readFileSync(exactFile(root, 'scenario/main.tf'), 'utf8'), 'correct');
  fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
  assert.throws(() => exactFile(root, 'outside'), { status: 403 });
});

test('standard permissions are the default; automatic actions require explicit opt-in', () => {
  const standard = chatArgs('hello', 'agent', ['docs'], false);
  assert.equal(standard[standard.indexOf('--approval-mode') + 1], 'default');
  assert.ok(!standard.includes('--yolo'));
  assert.equal(chatArgs('--yolo', 'ask', [], false)[0], '--prompt=--yolo');
  const automatic = chatArgs('hello', 'code', [], true);
  assert.equal(automatic[automatic.indexOf('--approval-mode') + 1], 'yolo');
});

test('only supported assistant text is forwarded', () => {
  assert.equal(extractText({ type: 'message', role: 'assistant', delta: true, content: 'Hello' }), 'Hello');
  assert.equal(extractText({ type: 'message', role: 'user', delta: true, content: 'secret' }), '');
  assert.equal(extractText({ type: 'thinking', text: 'private' }), '');
});

function run(source, options = {}) {
  const res = new EventEmitter();
  const events = [];
  let saved;
  let resolve;
  const done = new Promise(value => { resolve = value; });
  res.end = () => resolve({ events, saved });
  const runs = new Map();
  const handle = startChatRun({ bin: process.execPath, args: ['-e', source], cwd: os.tmpdir(), env: { PATH: process.env.PATH }, res,
    send: (type, data) => { events.push({ type, data }); options.onEvent?.(type, data, res); },
    persist: answer => { saved = answer; if (res.destroyed) resolve({ events, saved }); },
    runs, runId: 'test', sid: 'session', workspace: 'test', activityFromTool: () => ({}), timeoutMs: 2000, ...options });
  return { done, handle, res, runs };
}
const emit = text => `process.stdout.write(${JSON.stringify(JSON.stringify({ type: 'message', role: 'assistant', delta: true, content: text }))});`;

test('delta-only and unterminated last lines are saved', async () => {
  const { events, saved } = await run(emit('A response without a completion tool')).done;
  assert.equal(saved, 'A response without a completion tool');
  assert.equal(events.at(-1).data.status, 'completed');
});

test('completion replaces divergent streamed output', async () => {
  const source = `console.log(JSON.stringify({type:'text_delta',text:'draft'})); console.log(JSON.stringify({type:'tool_use',tool_name:'attempt_completion',parameters:{result:'final'}}));`;
  const { events, saved } = await run(source).done;
  assert.equal(saved, 'final');
  assert.ok(events.some(event => event.type === 'replace_text' && event.data.text === 'final'));
});

test('failed runs retain partial output and a visible failure', async () => {
  const { events, saved } = await run(`${emit('Partial answer')} process.exitCode=1;`).done;
  assert.match(saved, /Partial answer/);
  assert.match(saved, /could not complete/);
  assert.equal(events.at(-1).data.status, 'failed');
});

test('cancel and disconnect stop a running process and preserve partial output', async () => {
  for (const disconnect of [false, true]) {
    let handle;
    const task = run(`console.log(JSON.stringify({type:'text_delta',text:'Partial'}));setInterval(()=>{},100);`, {
      onEvent(type, _data, res) {
        if (type !== 'text') return;
        if (disconnect) { res.destroyed = true; res.emit('close'); }
        else handle.cancel();
      },
    });
    handle = task.handle;
    const result = await task.done;
    assert.match(result.saved, /Partial/);
    assert.match(result.saved, /Cancelled/);
    assert.equal(task.runs.size, 0);
  }
});

test('timeouts and output limits terminate the run', async () => {
  const timed = await run('setInterval(()=>{},100)', { timeoutMs: 80 }).done;
  assert.match(timed.saved, /time limit/);
  const large = await run(`console.log('x'.repeat(1000));setInterval(()=>{},100)`, { maxBytes: 20 }).done;
  assert.match(large.saved, /output limit/);
});

test('usage does not present total tokens as context occupancy', async () => {
  const result = await run(`console.log(JSON.stringify({type:'result',stats:{total_tokens:123}}));${emit('Done')}`).done;
  const usage = result.events.find(event => event.type === 'usage').data;
  assert.equal(usage.totalTokens, 123);
  assert.equal(usage.contextUsed, null);
  assert.equal(usage.contextLimit, null);
});

test('cancellation also terminates a child process that ignores SIGTERM', async () => {
  let descendantPid;
  let handle;
  const source = `const {spawn}=require('node:child_process'); const sub=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},100)'],{stdio:'ignore'});setTimeout(()=>console.log(JSON.stringify({type:'text_delta',text:String(sub.pid)})),100);setInterval(()=>{},100);`;
  const task = run(source, { onEvent(type, data) { if (type === 'text' && /^\d+$/.test(data.text)) { descendantPid = Number(data.text); handle.cancel(); } } });
  handle = task.handle;
  await task.done;
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.ok(descendantPid);
  assert.throws(() => process.kill(descendantPid, 0), { code: 'ESRCH' });
});
