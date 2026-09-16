// Types mirroring the bob-web backend API

export interface ShellSession { index: number; id: string; title: string; age: string }

export interface Session {
  id: string;
  title: string;
  mode: string;
  workspaceId: string;
  created: number;
  updated: number;
  preview: string;
}

export interface Message {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface SessionDetail extends Session {
  messages: Message[];
}

export interface Mode {
  id: string;
  label: string;
}

export interface Skill {
  name: string;
  description: string;
}

export interface Mcp {
  name: string;
}

export interface SupportProfile {
  id: string;
  label: string;
  description: string;
  defaultMode: string;
  mcps: string[];
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  active: boolean;
}

export interface SourceFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  content: string;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  media_type?: string;
  file_size?: number;
  download_url?: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  url: string;
  space: { key: string; name: string } | null;
  author: string | null;
  created: string | null;
  updated: string | null;
  version: number | null;
  content: string;
  format: string;
  attachments: ConfluenceAttachment[];
}

export interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
}

/** A factual, user-visible step in Bob's work; this is not private model reasoning. */
export interface ActivityEvent {
  label: string;
  detail?: string;
  state?: 'active' | 'complete';
}

export interface SessionUsage {
  sessionId: string;
  taskId: string;
  workspace: string;
  contextUsed: number | null;
  contextLimit: number | null;
  totalTokens?: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number | null;
  cacheWrite: number | null;
  apiCost: number | null;
  durationMs: number;
}

// SSE event shapes sent by /api/chat
export type ChatEvent =
  | { type: 'activity';  data: ActivityEvent }
  | { type: 'tool_use';  data: ToolCallEvent }
  | { type: 'usage';     data: SessionUsage }
  | { type: 'text';      data: { text: string } }
  | { type: 'done';      data: { sessionId: string; exitCode: number } }
  | { type: 'error';     data: { message: string } };
