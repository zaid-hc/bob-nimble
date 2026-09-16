'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set('.txt .log .md .markdown .tf .tfvars .hcl .json .yaml .yml .go .sh .ps1 .py .js .jsx .ts .tsx .csv .xml .html .css .sql .conf .ini .toml .properties'.split(' '));

function validateAttachment(name, buffer) {
  if (typeof name !== 'string' || name.length > 200 || !/^[\w .()-]+$/.test(name) || name.startsWith('.')) {
    throw new Error('Choose a file with a simple filename (letters, numbers, spaces, dots, dashes or parentheses).');
  }
  if (!TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) throw new Error('Only text, code and log files are supported in this beta. Images, PDFs and archives are not supported yet.');
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) throw new Error('Each attachment must be 15 MB or smaller.');
  try {
    if (buffer.includes(0)) throw new Error();
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch { throw new Error('This file is not UTF-8 text. Export it as text before attaching it.'); }
}

function exactFile(root, requested) {
  const workspaceRoot = fs.realpathSync(root);
  const resolved = fs.realpathSync(path.resolve(workspaceRoot, requested));
  const relative = path.relative(workspaceRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    const error = new Error('Files can only be opened from the selected workspace.');
    error.status = 403;
    throw error;
  }
  return resolved;
}

function extractText(evt) {
  if (evt.type === 'message' && evt.role === 'assistant' && evt.delta === true) return typeof evt.content === 'string' ? evt.content : '';
  if (!['text_delta', 'message_delta', 'assistant_message_delta', 'assistant_text'].includes(evt.type)) return '';
  const value = evt.delta ?? evt.text ?? evt.content?.text ?? evt.content;
  return typeof value === 'string' ? value : '';
}

function chatArgs(prompt, mode, mcps, automaticActions) {
  // Bind the prompt as an option value so a leading "--" cannot change flags.
  const args = [`--prompt=${prompt}`, '--output-format', 'stream-json', '--trust', '--approval-mode', automaticActions ? 'yolo' : 'default'];
  if (mode !== 'agent') args.push('--chat-mode', mode);
  for (const name of mcps) args.push('--allowed-mcp-server-names', name);
  return args;
}

// One lifecycle owns the process, stream, persisted response and cancellation.
function startChatRun({ bin, args, cwd, env, res, send, persist, runs, runId, sid, workspace, activityFromTool, engine = 'bob', stdin, timeoutMs = 300000, maxBytes = 4 * 1024 * 1024 }) {
  let child;
  let finished = false;
  let stopped = '';
  let stream = '';
  let finalAnswer = '';
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let taskId = sid;
  let timeout;
  let forceKill;
  let reason = '';
  const startedAt = Date.now();
  function signalTree(signal) {
    if (!child?.pid) return;
    try {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { try { child.kill(); } catch {} });
      } else process.kill(-child.pid, signal);
    } catch (error) { if (error.code !== 'ESRCH') { try { child.kill(signal); } catch {} } }
  }
  function cancel(message = 'Cancelled by you.') {
    if (finished || stopped) return;
    stopped = message;
    signalTree('SIGTERM');
    forceKill = setTimeout(() => signalTree('SIGKILL'), 1000);
    forceKill.unref();
  }
  function onClose() { if (!finished) cancel('Cancelled because the dashboard disconnected.'); }
  function consume(line) {
    let evt;
    try { evt = JSON.parse(line); } catch { return; }
    if (engine === 'opencode') {
      if (typeof evt.sessionID === 'string') taskId = evt.sessionID;
      if (evt.type === 'text' && typeof evt.part?.text === 'string') evt = { type: 'text_delta', text: evt.part.text };
      else if (evt.type === 'tool_use') evt = { type: 'tool_use', tool_name: evt.part?.tool || 'tool', parameters: evt.part?.state?.input || {} };
      else if (evt.type === 'error') { reason = evt.error?.data?.statusCode === 401 ? 'Bob login expired. Reconnect OpenCode to IBM Bob.' : 'OpenCode could not complete the request. Check model availability, MCP connectivity, and permissions.'; return; }
      else if (evt.type === 'step_finish') {
        const tokens = evt.part?.tokens || {};
        send('usage', { sessionId: sid, taskId, workspace, contextUsed: null, contextLimit: null, totalTokens: tokens.total || 0, inputTokens: tokens.input || 0, outputTokens: tokens.output || 0, cacheRead: tokens.cache?.read ?? null, cacheWrite: tokens.cache?.write ?? null, apiCost: null, durationMs: Date.now() - startedAt });
      }
    }
    if (evt.type === 'init' && typeof evt.session_id === 'string') taskId = evt.session_id;
    const delta = extractText(evt);
    if (delta) {
      if (!stream) send('activity', { label: 'First response received', detail: 'Bob started responding', state: 'complete' });
      stream += delta;
      send('text', { text: delta });
    }
    if (evt.type === 'tool_use') {
      if (evt.tool_name === 'attempt_completion') finalAnswer = typeof evt.parameters?.result === 'string' ? evt.parameters.result.trim() : '';
      else {
        send('activity', activityFromTool(evt.tool_name));
        send('tool_use', { name: evt.tool_name, input: evt.parameters });
      }
    }
    if (evt.type === 'result' && evt.stats) {
      const stats = evt.stats;
      send('usage', { sessionId: sid, taskId, workspace, contextUsed: null, contextLimit: null,
        totalTokens: Number(stats.total_tokens) || 0, inputTokens: Number(stats.input_tokens) || 0,
        outputTokens: Number(stats.output_tokens) || 0, cacheRead: null, cacheWrite: null,
        apiCost: Number.isFinite(Number(stats.session_costs)) ? Number(stats.session_costs) : null,
        durationMs: Number(stats.duration_ms) || Date.now() - startedAt });
    }
  }
  function finish(code) {
    if (finished) return;
    buffer += decoder.end();
    if (buffer.trim() && !stopped) consume(buffer);
    finished = true;
    clearTimeout(timeout);
    // A terminated parent may leave descendants behind. Keep the group-kill timer
    // when cancelling, even after the parent's close event.
    if (!stopped) clearTimeout(forceKill);
    res.off('close', onClose);
    runs.delete(runId);
    let answer = stopped ? stream || finalAnswer : finalAnswer || stream;
    if (!stopped && finalAnswer && finalAnswer !== stream) {
      if (finalAnswer.startsWith(stream)) send('text', { text: finalAnswer.slice(stream.length) });
      else send('replace_text', { text: finalAnswer });
    }
    const status = stopped ? 'cancelled' : code === 0 && answer && !reason ? 'completed' : 'failed';
    if (status !== 'completed') {
      const note = stopped || reason || (code === 0 ? 'Bob ended without a response.' : 'Bob could not complete this request. If an approval is required, continue in Bob Shell; the dashboard cannot answer approval prompts yet.');
      const suffix = `\n\n_${note}_`;
      answer += suffix;
      send('text', { text: suffix });
    }
    try { persist(answer); }
    catch { send('error', { message: 'The response could not be saved. Copy it before leaving this chat.' }); }
    send('done', { sessionId: sid, runId, exitCode: code ?? 1, status });
    if (!res.destroyed) res.end();
  }
  runs.set(runId, { cancel });
  res.on('close', onClose);
  child = spawn(bin, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdin.on('error', () => {});
  child.stdin.end(stdin); // Prompt only; never auto-answer permission prompts.
  timeout = setTimeout(() => cancel('Stopped after the request time limit.'), timeoutMs);
  child.stdout.on('data', chunk => {
    if (finished || stopped) return;
    bytes += chunk.length;
    if (bytes > maxBytes) return cancel('Stopped because the response exceeded the output limit.');
    buffer += decoder.write(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) consume(line);
  });
  // Drain diagnostics without exposing credentials or customer content in logs.
  child.stderr.on('data', () => {});
  child.on('error', () => { reason = 'Could not start Bob. Check the Bob executable and local sign-in.'; finish(1); });
  child.on('close', finish);
  return { cancel };
}


/**
 * Stream a chat/completions response from the Bob Gateway directly to the
 * dashboard SSE connection.  The gateway speaks OpenAI-compatible SSE:
 *   data: {"choices":[{"delta":{"content":"..."}}],...}
 *   data: [DONE]
 *
 * Returns a cancel() function.  The caller must have already written SSE
 * headers and called res.flushHeaders().
 */
function startGatewayChatRun({ gatewayClient, messages, model, res, send, persist, runs, runId, sid, activityFromTool, timeoutMs = 120000, maxBytes = 4 * 1024 * 1024 }) {
  let finished = false;
  let stopped = '';
  let stream = '';
  let bytes = 0;
  let controller = new AbortController();
  let forceKill;
  const startedAt = Date.now();

  function cancel(message = 'Cancelled by you.') {
    if (finished || stopped) return;
    stopped = message;
    controller.abort();
    clearTimeout(forceKill);
    forceKill = setTimeout(() => { finished || finish(null); }, 800);
    forceKill.unref();
  }

  function onClose() { if (!finished) cancel('Cancelled because the dashboard disconnected.'); }
  res.on('close', onClose);
  runs.set(runId, { cancel });

  const deadline = setTimeout(() => cancel('Stopped after the request time limit.'), timeoutMs);

  (async () => {
    let response;
    try {
      response = await gatewayClient.stream({ model, messages, signal: controller.signal });
    } catch (error) {
      finish(error);
      return;
    }

    if (finished || stopped) { finish(null); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (stopped) { await reader.cancel().catch(() => {}); break; }

        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => {});
          cancel('Stopped because the response exceeded the output limit.');
          break;
        }

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }

          // Usage summary (some gateways send as final chunk)
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          }

          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            if (!stream) send('activity', { label: 'First response received', detail: 'Bob Gateway started responding', state: 'complete' });
            stream += delta;
            send('text', { text: delta });
          }

          // finish_reason signals end of this choice
          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason && finishReason !== 'null') {
            // nothing extra needed; loop will hit [DONE] or EOF
          }
        }
      }
    } catch (error) {
      if (!stopped) finish(error);
      return;
    }

    if (inputTokens || outputTokens) {
      send('usage', {
        sessionId: sid, taskId: sid, workspace: '',
        contextUsed: null, contextLimit: null,
        totalTokens: inputTokens + outputTokens,
        inputTokens, outputTokens,
        cacheRead: null, cacheWrite: null,
        apiCost: null, durationMs: Date.now() - startedAt,
      });
    }

    finish(null);
  })().catch(error => { if (!finished) finish(error); });

  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearTimeout(forceKill);
    res.off('close', onClose);
    runs.delete(runId);

    let answer = stream;
    const status = stopped
      ? 'cancelled'
      : (error || !answer)
        ? 'failed'
        : 'completed';

    if (status !== 'completed') {
      const note = stopped || (error?.message ?? 'Bob Gateway ended without a response.');
      const suffix = `\n\n_${note}_`;
      answer += suffix;
      send('text', { text: suffix });
    }

    try { persist(answer || '_No response._'); }
    catch { send('error', { message: 'The response could not be saved. Copy it before leaving this chat.' }); }

    send('done', { sessionId: sid, runId, exitCode: status === 'completed' ? 0 : 1, status });
    if (!res.destroyed) res.end();
  }

  return { cancel };
}

module.exports = { MAX_FILE_BYTES, validateAttachment, exactFile, extractText, chatArgs, startChatRun, startGatewayChatRun };
