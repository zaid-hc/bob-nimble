import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Deliberately separate from Bob Shell and the dashboard conversation database.
export function modelLab(): Plugin {
  const token = randomBytes(32).toString('hex');
  const cwd = mkdtempSync(join(tmpdir(), 'secure-support-model-lab-'));
  const binary = process.env.OPENCODE_BIN || join(homedir(), '.opencode', 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode');
  const env = { ...process.env,
    // The installed plugin compares remainingPercent > threshold. Suppress its
    // automatic feedback for this experiment without rewriting global settings.
    BOB_FEEDBACK_THRESHOLD: String(-Number.MAX_VALUE),
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { '*': 'deny' }, share: 'disabled' }),
  };
  let models: string[] = [];
  const sessions = new Set<string>();
  let activeStop: (() => void) | undefined;
  return {
    name: 'secure-support-model-lab',
    configureServer(server) {
      server.httpServer?.once('close', () => activeStop?.());
      server.middlewares.use('/model-lab', async (req, res) => {
        const origin = req.headers.origin;
        const allowed = new Set(['http://localhost:3002', 'http://127.0.0.1:3002']);
        const host = req.headers.host || '';
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
        const json = (status: number, value: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(value));
        };
        if (!local || !allowed.has(`http://${host}`) || (origin && !allowed.has(origin)) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Local V3 access only.' });
        const route = (req.url || '').split('?')[0];
        if (route === '/auth' && req.method === 'GET') return json(200, { token });
        const provided = String(req.headers.authorization || '').replace(/^Bearer /, '');
        if (Buffer.byteLength(provided) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) return json(401, { error: 'Reload V3 to authorize the model test.' });
        if (req.method === 'POST' && !origin) return json(403, { error: 'An origin is required.' });
        if (route === '/cancel' && req.method === 'POST') { activeStop?.(); return json(202, { stopping: true }); }
        if (activeStop) return json(409, { error: 'A model test is already running. Wait or stop it first.' });
        if (route === '/models' && req.method === 'GET') {
          const child = spawn(binary, ['models', 'ibm-bob'], { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
          let text = ''; let ended = false;
          const timer = setTimeout(() => child.kill(), 20000);
          activeStop = () => child.kill();
          child.stdout.on('data', data => { text += data; if (text.length > 100000) child.kill(); });
          const finish = (ok: boolean) => { if (ended) return; ended = true; clearTimeout(timer); activeStop = undefined;
            models = ok ? [...new Set(text.split(/\r?\n/).filter(line => /^ibm-bob\/[\w./-]+$/.test(line)))] : [];
            json(models.length ? 200 : 503, models.length ? { models } : { error: 'Could not load Bob models. Check OpenCode and your Bob login.' });
          };
          child.on('error', () => finish(false)); child.on('close', code => finish(code === 0));
          return;
        }
        if (route !== '/chat' || req.method !== 'POST') return json(404, { error: 'Not found.' });
        let body = '';
        try {
          for await (const data of req) { body += data; if (body.length > 12000) return json(413, { error: 'Keep test prompts below 8,000 characters.' }); }
          const input = JSON.parse(body);
          if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 8000 || !models.includes(input.model) || (input.sessionId && !sessions.has(input.sessionId))) return json(400, { error: 'Choose an available model and enter a test prompt. Start a new test after restarting V3.' });
          const args = ['run', '--model', input.model, '--agent', 'plan', '--format', 'json'];
          if (input.sessionId) args.push('--session', input.sessionId);
          // stdin carries the prompt: no command interpolation or prompt-as-option.
          const child = spawn(binary, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'ignore'] });
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          const emit = (data: unknown) => { if (!res.destroyed) res.write(JSON.stringify(data) + '\n'); };
          let pending = ''; let bytes = 0; let stopped = false; let failed = false; let textSeen = false; let closed = false;
          let force: ReturnType<typeof setTimeout> | undefined;
          const signal = (sig: NodeJS.Signals) => { if (!child.pid) return; try { if (process.platform === 'win32') child.kill(sig); else process.kill(-child.pid, sig); } catch { /* already exited */ } };
          const stop = () => { stopped = true; signal('SIGTERM'); force = setTimeout(() => signal('SIGKILL'), 1000); };
          activeStop = stop;
          const timer = setTimeout(stop, 120000);
          res.on('close', () => { if (!closed) stop(); });
          const parse = (line: string) => {
            if (!line.trim()) return;
            try {
              const event = JSON.parse(line);
              if (typeof event.sessionID === 'string') { sessions.add(event.sessionID); emit({ type: 'session', id: event.sessionID }); }
              if (event.type === 'text' && typeof event.part?.text === 'string') { textSeen = true; emit({ type: 'text', text: event.part.text }); }
              if (event.type === 'step_finish') emit({ type: 'usage', tokens: event.part?.tokens?.total ?? null });
              if (event.type === 'error') { failed = true; emit({ type: 'error', error: event.error?.data?.statusCode === 401 ? 'Bob sign-in expired. Reconnect with opencode auth login.' : 'Bob could not complete this test. Check the selected model and OpenCode setup.' }); }
            } catch { failed = true; }
          };
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', (chunk: string) => { bytes += chunk.length; if (bytes > 1000000) { stop(); return; } pending += chunk; const lines = pending.split('\n'); pending = lines.pop() || ''; lines.forEach(parse); });
          child.stdin.on('error', () => {}); child.stdin.end(input.message.trim());
          child.on('error', () => { failed = true; emit({ type: 'error', error: 'OpenCode could not start. Check its installation.' }); });
          child.on('close', code => { parse(pending); closed = true; clearTimeout(timer); if (force && !stopped) clearTimeout(force); activeStop = undefined;
            emit({ type: 'done', status: stopped ? 'stopped' : code === 0 && !failed && textSeen ? 'complete' : 'failed' }); res.end();
          });
        } catch { if (!res.headersSent) json(400, { error: 'Invalid test request.' }); else res.end(); }
      });
    },
  };
}
