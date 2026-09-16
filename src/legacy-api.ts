import type { Session, SessionDetail, Mode, Skill, Mcp, ToolCallEvent, ActivityEvent, Workspace, ShellSession } from './types';

const BASE = '';  // same-origin REST calls via Vite proxy

// /api/chat uses SSE. Vite's http-proxy buffers the response body before
// forwarding, so all events arrive at once and React collapses the state
// updates. Fix: call the backend directly (CORS is enabled on :3000 for :3001).
const BACKEND = `${window.location.protocol}//${window.location.hostname}:3100`;
let localTokenPromise: Promise<string> | null = null;

export const api = {
  sessions:  (): Promise<Session[]>     => get('/api/sessions'),
  session:   (id: string): Promise<SessionDetail> => get(`/api/sessions/${id}`),
  ideSessions: (): Promise<Session[]> => get('/ide-api/sessions'),
  ideSession: (id: string): Promise<SessionDetail> => get(`/ide-api/sessions/${id}`),
  deleteSession: (id: string): Promise<void>       => del(`/api/sessions/${id}`),
  modes:     (): Promise<Mode[]>        => get('/api/modes'),
  skills:    (): Promise<Skill[]>       => get('/api/skills'),
  mcps:      (): Promise<Mcp[]>         => get('/api/mcps'),
  workspaces: (): Promise<Workspace[]>  => get('/api/workspaces'),
  createWorkspace: (name: string): Promise<Workspace> => post('/api/workspaces', { name }),
  shellSessions: async (workspaceId: string): Promise<ShellSession[]> => {
    const token = await getLocalToken();
    return authorizedGet(`/api/shell/sessions?workspaceId=${encodeURIComponent(workspaceId)}`, token);
  },
  deleteShellSession: async (id: string, workspaceId: string): Promise<void> => {
    const token = await getLocalToken();
    const response = await fetch(`${BACKEND}/api/shell/sessions/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not delete Bob Shell session');
  },
};

async function getLocalToken(): Promise<string> {
  if (!localTokenPromise) {
    localTokenPromise = fetch('/api/local-auth', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not authorize the local Bob service');
        const payload = await response.json() as { token?: string };
        if (!payload.token) throw new Error('The local Bob service did not return an authorization token');
        return payload.token;
      })
      .catch(error => {
        localTokenPromise = null;
        throw error;
      });
  }
  return localTokenPromise;
}

async function authorizedGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(BACKEND + path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Local Bob service request failed');
  return response.json();
}

async function get<T>(path: string): Promise<T> {
  const headers = path.startsWith('/api/') ? { Authorization: `Bearer ${await getLocalToken()}` } : undefined;
  const r = await fetch(BASE + path, { headers });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function del(path: string): Promise<void> {
  const response = await fetch(BASE + path, { method: 'DELETE', headers: { Authorization: `Bearer ${await getLocalToken()}` } });
  if (!response.ok) throw new Error('Could not delete the conversation.');
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getLocalToken()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed');
  return r.json();
}

/** Stream a bob chat response, calling back for each SSE event */
export function streamChat(opts: {
  message: string;
  sessionId?: string;
  mode: string;
  workspaceId?: string;
  mcps?: string[];
  skill?: string;
  onActivity: (evt: ActivityEvent) => void;
  onToolCall: (evt: ToolCallEvent) => void;
  /** textChunk is appended to one live answer; cumulative payloads are also tolerated by the UI. */
  onText:     (textChunk: string, resolvedSessionId?: string) => void;
  onDone:     (sessionId: string, exitCode: number) => void;
  onError:    (msg: string) => void;
}): () => void {
  const controller = new AbortController();

  (async () => {
    const r = await fetch(`${BACKEND}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getLocalToken()}` },
      body:    JSON.stringify({
        message:   opts.message,
        sessionId: opts.sessionId,
        mode:      opts.mode,
        workspaceId: opts.workspaceId,
        mcps:      opts.mcps ?? [],
        skill:     opts.skill,
      }),
      signal: controller.signal,
    });

    if (!r.ok || !r.body) {
      opts.onError(`HTTP ${r.status}`);
      return;
    }

    const reader  = r.body.getReader();
    const decoder = new TextDecoder();
    let buf              = '';
    let resolvedSid: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by \n\n)
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';

      for (const part of parts) {
        let eventType = 'message';
        let dataStr   = '';

        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          if (line.startsWith('data: '))  dataStr   = line.slice(6);
        }

        if (!dataStr) continue;
        try {
          const payload = JSON.parse(dataStr);
          if      (eventType === 'activity') opts.onActivity(payload);
          else if (eventType === 'tool_use') opts.onToolCall(payload);
          else if (eventType === 'text')     { console.debug('[SSE text]', payload.text?.slice(0, 80)); opts.onText(payload.text, resolvedSid); }
          else if (eventType === 'done')     { resolvedSid = payload.sessionId; console.debug('[SSE done]', payload); opts.onDone(payload.sessionId, payload.exitCode); }
          else if (eventType === 'error')    opts.onError(payload.message);
        } catch { /* ignore malformed events */ }
      }
    }
  })().catch(err => {
    if (err.name !== 'AbortError') opts.onError(err.message);
  });

  return () => controller.abort();
}

export function streamShell(opts: {
  message: string;
  sessionId?: string;
  workspaceId: string;
  mode: 'ask' | 'agent';
  confirmAgent?: boolean;
  mcps?: string[];
  onSession: (sessionId: string | undefined, runId: string) => void;
  onActivity: (evt: ActivityEvent) => void;
  onToolCall: (evt: ToolCallEvent) => void;
  onText: (textChunk: string) => void;
  onDone: (sessionId: string | undefined, exitCode: number) => void;
  onError: (message: string) => void;
}): () => void {
  const controller = new AbortController();
  let runId: string | undefined;

  (async () => {
    const token = await getLocalToken();
    const path = opts.sessionId
      ? `/api/shell/sessions/${encodeURIComponent(opts.sessionId)}/messages`
      : '/api/shell/sessions';
    const response = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: opts.message,
        workspaceId: opts.workspaceId,
        mode: opts.mode,
        confirmAgent: opts.confirmAgent === true,
        mcps: opts.mcps ?? [],
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      opts.onError(payload.error || `HTTP ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const block of events) {
        let eventType = '';
        let dataText = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          if (line.startsWith('data: ')) dataText = line.slice(6);
        }
        if (!dataText) continue;

        const payload = JSON.parse(dataText);
        if (eventType === 'session') {
          runId = payload.runId;
          opts.onSession(payload.sessionId, payload.runId);
        } else if (eventType === 'activity') {
          opts.onActivity(payload);
        } else if (eventType === 'tool_use') {
          opts.onToolCall(payload);
        } else if (eventType === 'text') {
          opts.onText(payload.text);
        } else if (eventType === 'done') {
          opts.onDone(payload.sessionId, payload.exitCode);
        } else if (eventType === 'error') {
          opts.onError(payload.message);
        }
      }
    }
  })().catch(error => {
    if (error.name !== 'AbortError') opts.onError(error.message);
  });

  return () => {
    void (async () => {
      if (runId) {
        try {
          const token = await getLocalToken();
          await fetch(`${BACKEND}/api/shell/runs/${encodeURIComponent(runId)}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Aborting the stream also closes and cancels the local child process.
        }
      }
      controller.abort();
    })();
  };
}
