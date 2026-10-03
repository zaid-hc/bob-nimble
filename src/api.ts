import type { Session, SessionDetail, Mode, Skill, Mcp, ToolCallEvent, ActivityEvent, Workspace, SourceFile, ConfluencePage, SessionUsage } from './types';

const BACKEND = ''; // same-origin: routed through Vite proxy to backend
let tokenPromise: Promise<string> | undefined;
async function localToken(): Promise<string> {
  if (!tokenPromise) tokenPromise = fetch('/api/local-auth', { credentials: 'include', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Cannot connect to the local Bob service. Check that the backend is running.');
      return (await response.json()).token as string;
    }).catch(error => { tokenPromise = undefined; throw error; });
  return tokenPromise;
}
async function request(path: string, options: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await localToken();
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    if (response.status !== 401 || attempt > 0) return response;
    tokenPromise = undefined;
  }
  throw new Error('Local authorization failed. Reload the dashboard.');
}
async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === 'string' ? body.error : `Local service returned HTTP ${response.status}.`;
}
async function get<T>(path: string): Promise<T> {
  const response = await request(path);
  if (!response.ok) throw new Error(await responseError(response));
  return response.json();
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json();
}
export interface UploadedAttachment { id: string; name: string; path: string; size: number }
export const api = {
  gatewayModels: (): Promise<{ source: string; models: string[]; profile: { instanceID: string; teamID: string } }> => get('/api/gateway/models'),
  gatewayStatus: (): Promise<{ connected: boolean; pending: boolean; profiles: { instanceID: string; teamID: string; label: string }[]; selected: { instanceID: string; teamID: string } | null; error: string }> => get('/api/gateway/auth/status'),
  gatewayLogin: (): Promise<{ url: string }> => post('/api/gateway/auth/start', {}),
  gatewayLogout: () => post('/api/gateway/auth/logout', {}),
  gatewaySelect: (instanceID: string, teamID: string) => post('/api/gateway/auth/select', { instanceID, teamID }),
  models: (): Promise<{ models: string[] }> => get('/api/models'),
  sessions: (): Promise<Session[]> => get('/api/sessions'),
  session: (id: string): Promise<SessionDetail> => get(`/api/sessions/${id}`),
  deleteSession: async (id: string): Promise<void> => {
    const response = await request(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await responseError(response));
  },
  modes: (): Promise<Mode[]> => get('/api/modes'),
  skills: (): Promise<Skill[]> => get('/api/skills'),
  mcps: (): Promise<Mcp[]> => get('/api/mcps'),
  triageStatus: (): Promise<{ available: boolean; ollamaRunning: boolean }> => get('/api/triage/status'),
  triage: (message: string): Promise<{ skill: string | null; mcps: string[]; urgency: number; confidence: number; durationMs: number }> => post('/api/triage', { message }),
  workspaces: (): Promise<Workspace[]> => get('/api/workspaces'),
  createWorkspace: (name: string, path?: string): Promise<Workspace> => post('/api/workspaces', { name, path }),
  file: (filePath: string, workspaceId: string): Promise<SourceFile> => get(`/api/files?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(filePath)}`),
  mcpConfig: (): Promise<SourceFile> => get('/api/mcp-config'),
  confluencePage: (pageId: string): Promise<ConfluencePage> => get(`/api/atlassian/confluence/pages/${encodeURIComponent(pageId)}`),
  upload: async (file: File, workspaceId: string): Promise<UploadedAttachment> => {
    const response = await request(`/api/attachments?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file,
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  },
};

/** Keep the stream open until the backend confirms completion/cancellation. */
export function streamChat(opts: {
  message: string; sessionId?: string; mode: string; workspaceId?: string; mcps?: string[]; skill?: string;
  attachments?: UploadedAttachment[]; automaticActions?: boolean;
  engine?: 'bob' | 'opencode'; model?: string;
  onActivity: (evt: ActivityEvent) => void;
  onToolCall: (evt: ToolCallEvent) => void;
  onUsage: (usage: SessionUsage) => void;
  onText: (chunk: string, sid?: string, replace?: boolean) => void;
  onDone: (sid: string, code: number, status?: string) => void;
  onError: (message: string) => void;
}): () => void {
  const controller = new AbortController();
  const runId = crypto.randomUUID();
  let complete = false;
  let cancelling = false;
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  (async () => {
    const response = await request(`${BACKEND}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ message: opts.message, sessionId: opts.sessionId, mode: opts.mode,
        workspaceId: opts.workspaceId, mcps: opts.mcps ?? [], skill: opts.skill,
        attachments: opts.attachments ?? [], automaticActions: opts.automaticActions === true, runId, engine: opts.engine ?? 'bob', model: opts.model }),
    });
    if (!response.ok || !response.body) throw new Error(await responseError(response));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sid = opts.sessionId;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const lines = part.split('\n');
        const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const payload = JSON.parse(data);
        if (type === 'session') sid = payload.sessionId;
        else if (type === 'activity') opts.onActivity(payload);
        else if (type === 'tool_use') opts.onToolCall(payload);
        else if (type === 'usage') opts.onUsage(payload);
        else if (type === 'text' || type === 'replace_text') opts.onText(payload.text, sid, type === 'replace_text');
        else if (type === 'error') throw new Error(payload.message);
        else if (type === 'done') { complete = true; opts.onDone(payload.sessionId, payload.exitCode, payload.status); }
      }
    }
    if (!complete) throw new Error('Connection ended before Bob confirmed completion. Partial output is shown; check the conversation after reconnecting.');
  })().catch(error => {
    if (!complete) opts.onError(error.name === 'AbortError'
      ? 'Connection closed while stopping. The backend will cancel on disconnect; reconnect to confirm the saved status.' : error.message);
  }).finally(() => { complete = true; clearTimeout(cancelTimer); });
  return () => {
    if (complete || cancelling) return;
    cancelling = true;
    opts.onActivity({ label: 'Stopping Bob', detail: 'Waiting for the local process to stop', state: 'complete' });
    cancelTimer = setTimeout(() => controller.abort(), 5000);
    request(`${BACKEND}/api/chat/runs/${runId}/cancel`, { method: 'POST' })
      .then(response => { if (!response.ok && !complete) controller.abort(); })
      .catch(() => controller.abort());
  };
}
