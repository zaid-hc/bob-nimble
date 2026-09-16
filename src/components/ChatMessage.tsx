import { type FC, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
  BookOpen, BrainCircuit, Check, ChevronDown, ChevronRight, CircleDot,
  ClipboardCheck, Code2, Coffee, Copy, ExternalLink, FileText, ListChecks,
  PersonStanding, Puzzle, Search, Share2, Sparkles, Wrench,
} from 'lucide-react';
import type { ActivityEvent, Message, ToolCallEvent } from '../types';

// ── Thinking block ────────────────────────────────────────────────────────────

interface ThinkingProps {
  toolCalls:  ToolCallEvent[];
  activities: ActivityEvent[];
  isLive:     boolean;   // still accumulating (bob is running)
  startedAt?: number;
  durationMs?: number;
}

type WorkingScene = {
  id: string;
  label: string;
  icon: FC<{ size?: number; strokeWidth?: number }>;
};

function workingScene(
  activities: ActivityEvent[],
  toolCalls: ToolCallEvent[],
  elapsedMs: number,
): WorkingScene {
  const seconds = elapsedMs / 1000;
  const longWaitCycle = seconds >= 20 ? Math.floor(seconds) % 38 : -1;

  // Playful breaks appear briefly only after Bob has been working for a while.
  if (longWaitCycle >= 24 && longWaitCycle < 28) {
    return { id: 'coffee', label: 'Quick coffee sip', icon: Coffee };
  }
  if (seconds >= 45 && longWaitCycle >= 32 && longWaitCycle < 35) {
    return { id: 'stretch', label: 'Taking a quick stretch', icon: PersonStanding };
  }

  const latestActivity = activities.at(-1)?.label ?? '';
  const latestTool = toolCalls.at(-1)?.name ?? '';
  const signal = `${latestActivity} ${latestTool}`.toLowerCase();

  if (/first response|complet|prepar.*response|attempt_completion/.test(signal)) {
    return { id: 'answer', label: 'Organizing the answer', icon: ClipboardCheck };
  }
  if (/doc|release|changelog|knowledge|confluence|article/.test(signal)) {
    return { id: 'docs', label: 'Checking the docs', icon: BookOpen };
  }
  if (/search|web|fetch|url|issue|jira|commit|look/.test(signal)) {
    return { id: 'search', label: 'Looking for clues', icon: Search };
  }
  if (/read_file|file content|get_file|directory/.test(signal)) {
    return { id: 'files', label: 'Reading project files', icon: FileText };
  }
  if (/code|write_file|shell|command|terminal|terraform|script/.test(signal)) {
    return { id: 'code', label: 'Working with code', icon: Code2 };
  }
  if (latestTool || /using /.test(signal)) {
    return { id: 'tools', label: 'Connecting support tools', icon: Puzzle };
  }
  if (seconds < 4 && /context loaded|request received|agent started|workspace/.test(signal)) {
    return { id: 'setup', label: 'Setting up the workspace', icon: Sparkles };
  }
  if (seconds < 9) {
    return { id: 'analyze', label: 'Understanding the request', icon: BrainCircuit };
  }
  if (seconds < 16) {
    return { id: 'plan', label: 'Planning the next steps', icon: ListChecks };
  }
  return { id: 'thinking', label: 'Working through the details', icon: Sparkles };
}

const BobWorkingStatus: FC<{
  scene: WorkingScene;
  elapsedMs: number;
}> = ({ scene, elapsedMs }) => {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));

  return (
    <span className="bob-working" aria-label={`Bob is working: ${scene.label}, ${seconds} seconds`}>
      <span key={`${scene.id}-label`} className="bob-working-label" aria-hidden="true">
        {scene.label} · {seconds}s
      </span>
    </span>
  );
};

const CINEMATIC_SCENES = {
  travel:   { label: 'On the way', image: '/bob-scene-travel.png' },
  research: { label: 'Researching', image: '/bob-scene-research.png' },
  coffee:   { label: 'Quick coffee sip', image: '/bob-scene-coffee.png' },
  writing:  { label: 'Preparing the answer', image: '/bob-scene-writing.png' },
} as const;

const BOB_TIPS = [
  {
    category: 'IBM Bob IDE tip',
    text: 'Press ⌘ + . on macOS or Ctrl + . on Windows/Linux to cycle through Bob modes.',
    href: 'https://bob.ibm.com/docs/ide/features/modes',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Select code and press ⌘/Ctrl + L to send it directly to Bob chat.',
    href: 'https://bob.ibm.com/docs/ide/getting-started/best-practices',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Use @terminal to include recent terminal output without copying and pasting it.',
    href: 'https://bob.ibm.com/docs/ide/getting-started/best-practices',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Use @problems to give Bob the current diagnostics from the Findings panel.',
    href: 'https://bob.ibm.com/docs/ide/getting-started/best-practices',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Use @/path/to/folder to share only the project context Bob needs.',
    href: 'https://bob.ibm.com/docs/ide/getting-started/best-practices',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'A project .bob/mcp.json overrides matching servers from your global ~/.bob/mcp.json.',
    href: 'https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Add .bobignore before sensitive workspaces to restrict which files Bob can access.',
    href: 'https://bob.ibm.com/docs/ide/security/bob-security-guidance',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Clear skill descriptions help Bob select the right specialized workflow automatically.',
    href: 'https://bob.ibm.com/docs/ide/features/skills',
  },
  {
    category: 'IBM Bob IDE tip',
    text: 'Explore the internal Figma MCP configuration guide for design workflows.',
    href: 'https://pages.github.ibm.com/Markus-Eisele/bob-book/poster/figma-mcp-configuration/',
  },
  {
    category: 'Dashboard tip',
    text: 'Choose Vault Support, Boundary Support, or Triage to start with a focused set of MCP tools.',
  },
  {
    category: 'Dashboard tip',
    text: 'Open the composer controls to review curated MCPs and add another tool only when needed.',
  },
  {
    category: 'Dashboard tip',
    text: 'Use workspaces to keep conversations grouped by customer, product, or investigation.',
  },
  {
    category: 'Dashboard tip',
    text: 'Completed answers include Copy and Share actions for faster customer collaboration.',
  },
  {
    category: 'Dashboard tip',
    text: 'Select the Thinking header to show or hide Bob’s live tool activity and completed steps.',
  },
] as const;

function shuffledTips(): Array<(typeof BOB_TIPS)[number]> {
  const tips = [...BOB_TIPS];
  for (let index = tips.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [tips[index], tips[swapWith]] = [tips[swapWith], tips[index]];
  }
  return tips;
}

function cinematicScene(sceneId: string): keyof typeof CINEMATIC_SCENES {
  if (sceneId === 'setup' || sceneId === 'analyze') return 'travel';
  if (sceneId === 'coffee' || sceneId === 'stretch') return 'coffee';
  if (sceneId === 'docs' || sceneId === 'search' || sceneId === 'files' || sceneId === 'plan' || sceneId === 'tools') {
    return 'research';
  }
  return 'writing';
}

const BobJourney: FC<{ scene: WorkingScene }> = ({ scene }) => {
  const [tipDeck, setTipDeck] = useState(shuffledTips);
  const [tipIndex, setTipIndex] = useState(0);
  const sceneId = cinematicScene(scene.id);
  const cinematic = CINEMATIC_SCENES[sceneId];
  const tip = tipDeck[tipIndex];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setTipIndex(current => {
        if (current + 1 < BOB_TIPS.length) return current + 1;
        setTipDeck(shuffledTips());
        return 0;
      });
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="bob-says" data-scene={sceneId}>
      <div className="bob-says-character" aria-hidden="true">
        <img
          key={sceneId}
          className="bob-says-scene-image"
          src={cinematic.image}
          alt=""
        />
        <span className="bob-says-scene-glow" />
      </div>
      <div key={tip.text} className="bob-says-bubble">
        <span className="bob-says-kicker">{cinematic.label} · {tip.category}</span>
        <span className="bob-says-copy">{tip.text}</span>
        {'href' in tip && tip.href && (
          <a href={tip.href} target="_blank" rel="noreferrer" aria-label="Open the source for this Bob tip">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
};

export const ThinkingBlock: FC<ThinkingProps> = ({ toolCalls, activities, isLive, startedAt, durationMs }) => {
  const [open, setOpen] = useState(isLive);
  const [elapsedMs, setElapsedMs] = useState(durationMs ?? 0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLive) {
      setElapsedMs(durationMs ?? (startedAt ? Date.now() - startedAt : 0));
      setOpen(false);
      return;
    }

    const updateElapsed = () => setElapsedMs(startedAt ? Date.now() - startedAt : 0);
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(timer);
  }, [isLive, startedAt, durationMs]);

  // Auto-scroll as new tool calls arrive
  useEffect(() => {
    if (isLive && open) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [toolCalls.length, activities.length, isLive, open]);

  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  const label = isLive ? 'Thinking…' : `Thought for ${seconds}s`;
  const detail = activities.length > 0
    ? `${activities.length} live step${activities.length !== 1 ? 's' : ''}`
    : toolCalls.length > 0
      ? `${toolCalls.length} action${toolCalls.length !== 1 ? 's' : ''}`
    : isLive ? 'Reasoning' : 'Response prepared';
  const scene = workingScene(activities, toolCalls, elapsedMs);

  return (
    <div className="thinking-block" style={{ marginBottom: 10 }}>
      <div>
        {/* Header row */}
        <button
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <img src="/bob-logo.png" alt="Bob"
            style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, opacity: 0.9, flexShrink: 0 }} />
          <span style={{
            fontSize: 'calc(var(--base-font-size) * 13 / 14)', fontWeight: 600,
            color: 'var(--text2)',
          }}>
            {label}
          </span>
          <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)', flex: 1 }}>
            {detail}
          </span>
          {isLive && (
            <BobWorkingStatus
              scene={scene}
              elapsedMs={elapsedMs}
            />
          )}
          {open
            ? <ChevronDown size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            : <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          }
        </button>

        {isLive && <BobJourney scene={scene} />}

        {/* Tool call list */}
        {open && (
          <div className="thinking-details" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {activities.map((activity, index) => (
              <div key={`${activity.label}-${index}`} className="activity-row">
                {activity.state === 'active'
                  ? <CircleDot size={13} className="activity-live-icon" />
                  : <Check size={13} className="activity-complete-icon" />}
                <div>
                  <div>{activity.label}</div>
                  {activity.detail && <small>{activity.detail}</small>}
                </div>
              </div>
            ))}
            {activities.length === 0 && toolCalls.length === 0 && isLive && (
              <div style={{ padding: '10px 14px', fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--text2)' }}>
                Analyzing your request and preparing a response…
              </div>
            )}
            {activities.length === 0 && toolCalls.length === 0 && !isLive && (
              <div style={{ padding: '10px 14px', fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--text2)' }}>
                Bob prepared this response without using external tools.
              </div>
            )}
            {toolCalls.map((tc, i) => (
              <ToolCallRow key={i} tc={tc} index={i} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};

const ToolCallRow: FC<{ tc: ToolCallEvent; index: number }> = ({ tc, index }) => {
  const [expanded, setExpanded] = useState(false);
  const hasInput = tc.input && Object.keys(tc.input).length > 0;

  // Friendly one-line summary of what this tool call is doing
  const summary = toolSummary(tc);

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '8px 16px',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: hasInput ? 'pointer' : 'default' }}
        onClick={() => hasInput && setExpanded(v => !v)}
      >
        {/* Step number */}
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--surface3)', border: '1px solid var(--border2)',
          fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, color: 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{index + 1}</span>
        <Wrench size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{
          fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontFamily: 'var(--mono)',
          color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
        }}>{tc.name}</span>
        {summary && (
          <span style={{
            fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}>— {summary}</span>
        )}
        {hasInput && (
          expanded
            ? <ChevronDown size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            : <ChevronRight size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        )}
      </div>

      {/* Expanded input */}
      {expanded && hasInput && (
        <pre style={{
          marginTop: 8,
          background: 'var(--code-bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '10px 12px',
          fontSize: 'calc(var(--base-font-size) * 11 / 14)',
          fontFamily: 'var(--mono)',
          color: 'var(--code-text)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}>
          {JSON.stringify(tc.input, null, 2)}
        </pre>
      )}
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
};

/** Extract a short human-readable description from a tool call's input */
function toolSummary(tc: ToolCallEvent): string {
  const i = tc.input as Record<string, unknown>;
  if (!i) return '';
  // Common patterns
  if (typeof i.path === 'string')        return i.path;
  if (typeof i.command === 'string')     return i.command.slice(0, 60);
  if (typeof i.query === 'string')       return i.query.slice(0, 60);
  if (typeof i.pattern === 'string')     return i.pattern;
  if (typeof i.jql === 'string')         return i.jql.slice(0, 60);
  if (typeof i.issue_key === 'string')   return i.issue_key;
  if (typeof i.name_path_pattern === 'string') return i.name_path_pattern;
  if (typeof i.url === 'string')         return i.url.slice(0, 60);
  return '';
}

// ── Streaming message (typewriter) ────────────────────────────────────────────

interface StreamingProps {
  fullText:   string;
  streaming:  boolean;  // true while the typewriter is still running
  onDone?:    () => void;
  onProgress?: () => void;
  onOpenResource?: (url: string) => void;
}

function isConfluenceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('atlassian.net') && parsed.pathname.includes('/wiki');
  } catch { return false; }
}

export const StreamingMessage: FC<StreamingProps> = ({ fullText, streaming, onDone, onProgress, onOpenResource }) => {
  const [displayed, setDisplayed] = useState('');
  const idxRef  = useRef(0);
  const rafRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenCountRef = useRef(0);
  const onDoneRef = useRef(onDone);
  const onProgressRef = useRef(onProgress);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  useEffect(() => {
    if (!streaming) {
      idxRef.current = fullText.length;
      setDisplayed(fullText);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      idxRef.current = fullText.length;
      setDisplayed(fullText);
      onDoneRef.current?.();
      return;
    }

    const stream = () => {
      const target = fullText;
      if (idxRef.current >= target.length) {
        setDisplayed(target);
        onDoneRef.current?.();
        return;
      }

      // Advance to the end of the next word (next whitespace boundary or end)
      let next = idxRef.current + 1;
      while (next < target.length && target[next] !== ' ' && target[next] !== '\n') {
        next++;
      }
      // Include the trailing whitespace/newline so words don't bunch together
      if (next < target.length) next++;

      const wordLen = next - idxRef.current;  // length of the word we just revealed
      idxRef.current = next;
      setDisplayed(target.slice(0, idxRef.current));
      tokenCountRef.current += 1;
      if (tokenCountRef.current % 4 === 0 || idxRef.current >= target.length) {
        onProgressRef.current?.();
      }

      // Token-like cadence with a little natural variation.
      const remaining = target.length - idxRef.current;
      const delay = remaining > 1800
        ? 18 + Math.random() * 14
        : 28 + Math.random() * 28 + Math.min(wordLen, 8);
      rafRef.current = setTimeout(stream, delay);
    };

    if (rafRef.current) clearTimeout(rafRef.current);
    rafRef.current = setTimeout(stream, 30);
    return () => { if (rafRef.current) clearTimeout(rafRef.current); };
  }, [fullText, streaming]);

  const text = streaming ? displayed : fullText;

  return (
    <div className="prose" style={{ fontSize: 'calc(var(--base-font-size) * 14 / 14)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={event => {
                if (!href || !isConfluenceUrl(href) || !onOpenResource) return;
                event.preventDefault();
                onOpenResource(href);
              }}
            >{children}</a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      {streaming && idxRef.current < fullText.length && (
        <span style={{
          display: 'inline-block',
          width: 2, height: '1em',
          background: 'var(--accent)',
          marginLeft: 2,
          verticalAlign: 'text-bottom',
          animation: 'cursorBlink 0.8s step-end infinite',
        }} />
      )}
      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// ── ChatMessage ───────────────────────────────────────────────────────────────

interface Props {
  message:   Message;
  streaming?: boolean;  // true while the typewriter hasn't finished
  onStreamingDone?: () => void;
  onStreamingProgress?: () => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (url: string) => void;
  resourceUrls?: string[];
}

function UserMessageText({ content, onOpenResource }: { content: string; onOpenResource?: (url: string) => void }) {
  const parts = content.split(/(https?:\/\/[^\s<>]+)/g);
  return <>{parts.map((part, index) => {
    if (!/^https?:\/\//.test(part)) return <span key={index}>{part}</span>;
    const href = part.replace(/[.,;:!?)]$/, '');
    const suffix = part.slice(href.length);
    return <span key={index}><a href={href} target="_blank" rel="noreferrer" onClick={event => {
      if (!isConfluenceUrl(href) || !onOpenResource) return;
      event.preventDefault();
      onOpenResource(href);
    }}>{href}</a>{suffix}</span>;
  })}</>;
}

function localFilePaths(content: string): string[] {
  const matches = content.match(/\/(?:Users|home)\/[^\s`*<>"']+/g) ?? [];
  const absolute = matches.map(match => match
    .replace(/\\([_()[\]{}-])/g, '$1')
    .replace(/[.,;:!?)]$/, '')
  );
  const directoryHint = content.match(/`((?:[\w.-]+\/)+)`/)?.[1] || '';
  const relative = [...content.matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.(?:tf|tfvars|sh|md|go|py|js|jsx|ts|tsx|json|ya?ml|hcl))`/gi)]
    .map(match => match[1].includes('/') || !directoryHint ? match[1] : `${directoryHint}${match[1]}`);
  return [...new Set([...absolute, ...relative])];
}

export const ChatMessage: FC<Props> = ({
  message,
  streaming = false,
  onStreamingDone,
  onStreamingProgress,
  onOpenFile,
  onOpenResource,
  resourceUrls = [],
}) => {
  const isUser = message.role === 'user';
  const time   = new Date(message.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const [copied, setCopied] = useState(false);
  const referencedFiles = !streaming && !isUser ? localFilePaths(message.content) : [];

  const copyResponse = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const shareResponse = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Bob response', text: message.content });
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent('Bob response')}&body=${encodeURIComponent(message.content)}`;
  };

  if (isUser) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface3)',
          }}>
            <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.04em' }}>YOU</span>
            <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)' }}>{time}</span>
          </div>
          <div style={{ padding: '14px 16px', fontSize: 'calc(var(--base-font-size) * 14 / 14)', color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <UserMessageText content={message.content} onOpenResource={onOpenResource} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface3)',
        }}>
          <img src="/bob-logo.png" alt="Bob" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, opacity: 0.9 }} />
          <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.04em', flex: 1 }}>BOB</span>
          <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)' }}>{time}</span>
        </div>
        <div style={{ padding: '16px' }}>
          <StreamingMessage
            fullText={message.content}
            streaming={streaming}
            onDone={onStreamingDone}
            onProgress={onStreamingProgress}
            onOpenResource={onOpenResource}
          />
          {referencedFiles.length > 0 && (
            <div className="referenced-files" aria-label="Files referenced by Bob">
              {referencedFiles.map(filePath => (
                <button key={filePath} onClick={() => onOpenFile?.(filePath)} title={`Open ${filePath}`}>
                  <FileText size={13} />
                  <span>{filePath.split('/').at(-1)}</span>
                  <span>Open code</span>
                </button>
              ))}
            </div>
          )}
          {!streaming && resourceUrls.length > 0 && (
            <div className="referenced-files" aria-label="Confluence pages used by Bob">
              {resourceUrls.map((url, index) => (
                <button key={url} onClick={() => onOpenResource?.(url)} title="Open Confluence page beside this chat">
                  <ExternalLink size={13} />
                  <span>Confluence page {resourceUrls.length > 1 ? index + 1 : ''}</span>
                  <span>Open page</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!streaming && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '0 12px 12px' }}>
            <button onClick={() => void copyResponse()} title="Copy response" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface3)', color: copied ? 'var(--green)' : 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => void shareResponse()} title="Share response" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface3)', color: 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Share2 size={13} /> Share
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
