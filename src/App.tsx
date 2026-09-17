import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MoreHorizontal, Palette, PanelLeftOpen, PanelRightOpen, Terminal } from 'lucide-react';
import { api, streamChat, type UploadedAttachment } from './api';
import { Sidebar }    from './components/Sidebar';
import { ModelPicker, providerName } from './components/ModelPicker';
import { GatewayConnection } from './components/GatewayConnection';
import { ModelLab } from './components/ModelLab';
import { ShellPrototype } from './components/ShellPrototype';
import { IdeHistory } from './components/IdeHistory';
import './experiments.css';
import { RightPanel } from './components/RightPanel';
import { ChatMessage, ThinkingBlock } from './components/ChatMessage';
import { Composer }   from './components/Composer';
import { SessionUsageBadge } from './components/SessionUsageBadge';
import { PersonalizationPanel, THEME_PRESETS, type PersonalizationSettings } from './components/PersonalizationPanel';
import type { Session, Message, Mode, Skill, Mcp, ToolCallEvent, ActivityEvent, Workspace, SupportProfile, SourceFile, ConfluencePage, SessionUsage } from './types';

type NavTab = 'chat' | 'insights' | 'gtm';
type Theme = 'light' | 'dark';
type ViewerTab = 'file' | 'resource';
type ThinkingRecord = {
  toolCalls: ToolCallEvent[];
  activities: ActivityEvent[];
  startedAt: number;
  durationMs?: number;
};

const PROFILE_DEFINITIONS: SupportProfile[] = [
  { id: 'vault', label: 'Vault Support', description: 'Lean Vault, Enterprise, secrets, PKI, and Headroom defaults. Add observability or case tools only when needed.', defaultMode: 'agent', mcps: ['vault-support-mcp', 'vault-enterprise-support-mcp', 'secrets-management-support-mcp', 'pki-support-mcp', 'headroom'] },
  { id: 'boundary', label: 'Boundary Support', description: 'Lean Boundary, networking, identity, PKI, and Headroom defaults. Add observability or case tools only when needed.', defaultMode: 'agent', mcps: ['boundary-support-mcp', 'networking-support-mcp', 'ldap-ad-support-mcp', 'pki-support-mcp', 'headroom'] },
  { id: 'triage', label: 'Case Triage', description: 'Focused case triage with Atlassian and Headroom. Add product knowledge only when it is available.', defaultMode: 'ask', mcps: ['mcp-atlassian', 'headroom'] },
  { id: 'custom', label: 'Custom tools', description: 'Manually choose MCPs for a deep investigation.', defaultMode: 'agent', mcps: [] },
];

const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  preset: 'ibm', colorMode: 'system', accent: THEME_PRESETS.ibm.accent, sidebarTint: THEME_PRESETS.ibm.sidebarTint,
  density: 'comfortable', fontSize: 14, sidebarWidth: 260, rightPanelWidth: 420,
  leftPanelOpen: true, rightPanelOpen: false, reducedMotion: false,
};

function loadPersonalization(workspaceId: string): PersonalizationSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(`bob-personalization:${workspaceId}`) || 'null');
    if (saved) return { ...DEFAULT_PERSONALIZATION, ...saved };
    const previousTheme = localStorage.getItem('bob-theme');
    return { ...DEFAULT_PERSONALIZATION, colorMode: previousTheme === 'light' || previousTheme === 'dark' ? previousTheme : 'system' };
  } catch {
    return { ...DEFAULT_PERSONALIZATION };
  }
}

function confluenceUrlsFromTools(toolCalls: ToolCallEvent[] = []): string[] {
  const urls = toolCalls.flatMap(toolCall => {
    if (!/confluence.*(?:get|page)|(?:get|page).*confluence/i.test(toolCall.name)) return [];
    const pageId = toolCall.input?.page_id ?? toolCall.input?.pageId;
    return typeof pageId === 'string' || typeof pageId === 'number'
      ? [`https://hashicorp.atlassian.net/wiki/pages/viewpage.action?pageId=${encodeURIComponent(String(pageId))}`]
      : [];
  });
  return [...new Set(urls)];
}

function referencedWorkspaceFiles(threadMessages: Message[]): string[] {
  const content = threadMessages.map(message => message.content).join('\n');
  const relative = [...content.matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.(?:tf|tfvars|sh|md|go|py|js|jsx|ts|tsx|json|ya?ml|hcl))`/gi)]
    .map(match => match[1]);
  const absolute = content.match(/\/(?:Users|home)\/[^\s`*<>"']+/g) ?? [];
  return [...new Set([...relative, ...absolute])].slice(-12);
}

export default function App() {
  const [view, setView] = useState<'chat' | 'models' | 'shell' | 'ide' | 'connection'>('chat');
  const engine = 'opencode' as const;
  const [modelCatalog, setModelCatalog] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => { try { const saved = localStorage.getItem('v3-selected-model') || ''; return saved.startsWith('ibm-bob/') ? saved : ''; } catch { return ''; } });
  const [modelError, setModelError] = useState('');
  useEffect(() => {
    let active = true;
    setModelError('');
    api.models().then(result => { if (active) { result.models = result.models.filter(id => id.startsWith('ibm-bob/')); setModelCatalog(result.models); setSelectedModel(current => result.models.includes(current) ? current : result.models.includes('ibm-bob/fast') ? 'ibm-bob/fast' : result.models[0] || ''); } })
      .catch(error => { if (active) setModelError(error.message); });
    return () => { active = false; };
  }, []);
  // ── Data ──────────────────────────────────────────────────────────────────
  const [sessions,  setSessions]  = useState<Session[]>([]);
  const [modes,     setModes]     = useState<Mode[]>([]);
  const [skills,    setSkills]    = useState<Skill[]>([]);
  const [mcps,      setMcps]      = useState<Mcp[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeId,  setActiveId]  = useState<string | null>(null);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [mode,      setMode]      = useState('agent');
  const [activeNav, setActiveNav] = useState<NavTab>('chat');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => localStorage.getItem('bob-workspace') || 'default');
  const [supportProfileId, setSupportProfileId] = useState('custom');
  const [composerGeneration, setComposerGeneration] = useState(0);
  const [leftOpen,  setLeftOpen]  = useState(() => window.innerWidth > 820);
  const [rightOpen, setRightOpen] = useState(false);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [activeSourcePath, setActiveSourcePath] = useState('');
  const [sourceFileLoading, setSourceFileLoading] = useState(false);
  const [sourceFileError, setSourceFileError] = useState('');
  const [confluencePage, setConfluencePage] = useState<ConfluencePage | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [activeViewer, setActiveViewer] = useState<ViewerTab>('file');
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [personalization, setPersonalization] = useState(() => loadPersonalization(activeWorkspaceId));
  const [systemTheme, setSystemTheme] = useState<Theme>(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const theme: Theme = personalization.colorMode === 'system' ? systemTheme : personalization.colorMode;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = personalization.density;
    root.dataset.reducedMotion = personalization.reducedMotion ? 'true' : 'false';
    root.style.setProperty('--accent', personalization.accent);
    root.style.setProperty('--accent-d', `color-mix(in srgb, ${personalization.accent} 78%, #000)`);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${personalization.accent} 14%, transparent)`);
    root.style.setProperty('--sidebar-tint', personalization.sidebarTint);
    root.style.setProperty('--base-font-size', `${personalization.fontSize}px`);
    root.style.setProperty('--sidebar-w', `${personalization.sidebarWidth}px`);
    root.style.setProperty('--rpanel-w', `${personalization.rightPanelWidth}px`);
    localStorage.setItem(`bob-personalization:${activeWorkspaceId}`, JSON.stringify(personalization));
    localStorage.setItem('bob-theme', theme);
  }, [theme, personalization, activeWorkspaceId]);

  // ── Preset skill from right panel ────────────────────────────────────────
  const [presetSkill, setPresetSkill] = useState('');

  // ── Streaming ─────────────────────────────────────────────────────────────
  const [loading,        setLoading]        = useState(false);
  const [pendingTools,   setPendingTools]   = useState<ToolCallEvent[]>([]);
  const [pendingActivities, setPendingActivities] = useState<ActivityEvent[]>([]);
  const [streamingMsgId, setStreamingMsgId] = useState<number | null>(null);
  const [thinkingByMessage, setThinkingByMessage] = useState<Record<number, ThinkingRecord>>({});
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const turnGeneration = useRef(0);
  const [startupError, setStartupError] = useState('');

  // ── Scroll ────────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  const followStreamingMessage = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.sessions(), api.modes(), api.skills(), api.mcps(), api.workspaces()])
      .then(([s, m, sk, mc, ws]) => {
        setSessions(s); setModes(m); setSkills(sk); setMcps(mc); setWorkspaces(ws);
        setActiveWorkspaceId(current => ws.some(workspace => workspace.id === current) ? current : 'default');
        if (s.length > 0) return loadSession(s[0].id);
      }).catch(() => setStartupError('Cannot load your workspaces. Check that the local Bob backend is running, then retry. Your saved chats have not been deleted.'));
  }, []);

  const loadSession = async (id: string) => {
    setSupportProfileId('custom');
    setComposerGeneration(current => current + 1);
    turnGeneration.current++;
    stopRef.current?.();
    stopRef.current = null;
    setLoading(false);
    const generation = turnGeneration.current;
    const detail = await api.session(id);
    if (generation !== turnGeneration.current) return;
    const workspaceId = detail.workspaceId || 'default';
    setActiveId(id);
    setActiveWorkspaceId(workspaceId);
    localStorage.setItem('bob-workspace', workspaceId);
    const workspacePersonalization = loadPersonalization(workspaceId);
    setPersonalization(workspacePersonalization);
    setLeftOpen(workspacePersonalization.leftPanelOpen && window.innerWidth > 820);
    setRightOpen(false);
    setMessages(detail.messages);
    setSourceFileError('');
    setMode(detail.mode);
    setPendingTools([]);
    setPendingActivities([]);
    setThinkingByMessage({});
    setThinkingStartedAt(null);
    setStreamingMsgId(null);
    try {
      setSessionUsage(JSON.parse(localStorage.getItem(`bob-usage:${id}`) || 'null'));
    } catch {
      setSessionUsage(null);
    }
    const referencedPaths = referencedWorkspaceFiles(detail.messages);
    if (referencedPaths.length > 0) {
      const opened = (await Promise.allSettled(referencedPaths.map(filePath => api.file(filePath, detail.workspaceId || 'default'))))
        .flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (generation !== turnGeneration.current) return;
      if (opened.length > 0) {
        setSourceFiles(current => {
          const paths = new Set(opened.map(file => file.path));
          return [...current.filter(file => !paths.has(file.path)), ...opened];
        });
        const primary = opened.find(file => file.name === 'main.tf') || opened[0];
        setActiveSourcePath(primary.path);
        setActiveViewer('file');
        // Only restore an open viewer preference when there is content to show.
        setRightOpen(workspacePersonalization.rightPanelOpen);
      }
    }
    setTimeout(scrollToBottom, 50);
  };

  const refreshSessions = async () => setSessions(await api.sessions());
  const supportProfiles = useMemo(() => PROFILE_DEFINITIONS.map(profile => ({ ...profile, mcps: profile.mcps.filter(name => mcps.some(mcp => mcp.name === name)) })), [mcps]);
  const selectSupportProfile = (id: string) => {
    const profile = PROFILE_DEFINITIONS.find(item => item.id === id);
    setSupportProfileId(id);
    if (profile) setMode(profile.defaultMode);
  };

  const selectWorkspace = (id: string) => {
    newChat();
    setActiveWorkspaceId(id);
    localStorage.setItem('bob-workspace', id);
    const next = loadPersonalization(id);
    setPersonalization(next);
    setLeftOpen(next.leftPanelOpen && window.innerWidth > 820);
    setRightOpen(false);
    setSourceFiles([]);
    setActiveSourcePath('');
    setSourceFileError('');
  };

  const updatePersonalization = (next: PersonalizationSettings) => {
    setPersonalization(next);
    setLeftOpen(next.leftPanelOpen);
    setRightOpen(next.rightPanelOpen);
  };

  const resetPersonalization = () => updatePersonalization({ ...DEFAULT_PERSONALIZATION });

  const openSourceFile = async (filePath: string) => {
    setRightOpen(true);
    setActiveViewer('file');
    setSourceFileLoading(true);
    setSourceFileError('');
    try {
      const sessionWorkspaceId = sessions.find(session => session.id === activeId)?.workspaceId || activeWorkspaceId;
      const opened = await api.file(filePath, sessionWorkspaceId);
      setSourceFiles(current => [...current.filter(file => file.path !== opened.path), opened]);
      setActiveSourcePath(opened.path);
    } catch (error) {
      setSourceFileError(error instanceof Error ? error.message : 'Could not open the file.');
    } finally {
      setSourceFileLoading(false);
    }
  };

  const openMcpConfig = async () => {
    setRightOpen(true);
    setActiveViewer('file');
    setSourceFileLoading(true);
    setSourceFileError('');
    try {
      const opened = await api.mcpConfig();
      setSourceFiles(current => [...current.filter(file => file.path !== opened.path), opened]);
      setActiveSourcePath(opened.path);
    } catch (error) {
      setSourceFileError(error instanceof Error ? error.message : 'Could not open the MCP configuration.');
    } finally {
      setSourceFileLoading(false);
    }
  };

  const openResource = async (url: string) => {
    setRightOpen(true);
    setActiveViewer('resource');
    setResourceUrl(url);
    setResourceLoading(true);
    setResourceError('');
    setConfluencePage(null);

    try {
      const parsed = new URL(url);
      const pageId = parsed.searchParams.get('pageId')
        || parsed.searchParams.get('homepageId')
        || parsed.pathname.match(/\/pages\/(\d+)/)?.[1];
      if (!parsed.hostname.endsWith('atlassian.net') || !parsed.pathname.includes('/wiki')) {
        throw new Error('This side preview currently supports Confluence links.');
      }
      if (!pageId) throw new Error('Could not determine the Confluence page ID from this link.');
      setConfluencePage(await api.confluencePage(pageId));
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : 'Could not open this Confluence page.');
    } finally {
      setResourceLoading(false);
    }
  };

  const createWorkspace = async (name: string, projectPath?: string) => {
    const workspace = await api.createWorkspace(name, projectPath);
    setWorkspaces(previous => [...previous, workspace]);
    selectWorkspace(workspace.id);
  };

  const newChat = () => {
    setSupportProfileId('custom');
    setComposerGeneration(current => current + 1);
    turnGeneration.current++;
    stopRef.current?.();
    stopRef.current = null;
    setActiveId(null);
    setMessages([]);
    setMode('agent');
    setLoading(false);
    setPendingTools([]);
    setPendingActivities([]);
    setThinkingByMessage({});
    setThinkingStartedAt(null);
    setStreamingMsgId(null);
    setSessionUsage(null);
    setRightOpen(false);
  };

  const deleteSession = async (id: string) => {
    await api.deleteSession(id);
    if (id === activeId) newChat();
    await refreshSessions();
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = async (opts: { message: string; mode: string; skill?: string; mcps: string[]; files?: File[]; automaticActions?: boolean }): Promise<boolean> => {
    if (loading) return false;
    if (engine === 'opencode' && !selectedModel) { setModelError('Choose an available Bob model before sending.'); return false; }
    const generation = ++turnGeneration.current;
    setLoading(true);
    let attachments: UploadedAttachment[] = [];
    try {
      for (const file of opts.files ?? []) attachments.push(await api.upload(file, activeWorkspaceId));
    } catch (error) { if (generation === turnGeneration.current) setLoading(false); throw error; }
    if (generation !== turnGeneration.current) return false;
    // Switch to chat tab
    setActiveNav('chat');

    const turnStartedAt = Date.now();
    let responseId: number | null = null;
    let turnTools: ToolCallEvent[] = [];
    let turnActivities: ActivityEvent[] = [];

    const userMsg: Message = {
      id: turnStartedAt, session_id: activeId ?? '',
      role: 'user', content: opts.message + (attachments.length ? `\n\nAttached files:\n${attachments.map(file => `- \`${file.path}\``).join('\n')}` : ''), ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setPendingTools([]);
    setPendingActivities([]);
    setThinkingStartedAt(turnStartedAt);
    setTimeout(scrollToBottom, 30);

    const stop = streamChat({
      engine, model: engine === 'opencode' ? selectedModel : undefined,
      message: opts.message, sessionId: activeId ?? undefined,
      attachments, automaticActions: opts.automaticActions,
      mode: opts.mode, skill: opts.skill, mcps: opts.mcps, workspaceId: activeWorkspaceId,
      onActivity: activity => {
        if (generation !== turnGeneration.current) return;
        turnActivities = [...turnActivities, activity];
        setPendingActivities(turnActivities);
        if (responseId !== null) {
          setThinkingByMessage(prev => ({
            ...prev,
            [responseId!]: {
              ...(prev[responseId!] ?? { startedAt: turnStartedAt, toolCalls: [] }),
              activities: turnActivities,
            },
          }));
        }
        setTimeout(scrollToBottom, 30);
      },
      onToolCall: tc => {
        if (generation !== turnGeneration.current) return;
        turnTools = [...turnTools, tc];
        setPendingTools(turnTools);
        if (responseId !== null) {
          setThinkingByMessage(prev => ({
            ...prev,
            [responseId!]: {
              ...(prev[responseId!] ?? { startedAt: turnStartedAt }),
              toolCalls: turnTools,
              activities: turnActivities,
            },
          }));
        }
        setTimeout(scrollToBottom, 30);
      },
      onUsage: usage => {
        if (generation !== turnGeneration.current) return;
        setSessionUsage(usage);
        localStorage.setItem(`bob-usage:${usage.sessionId}`, JSON.stringify(usage));
      },
      onText: (chunk, sid, replace) => {
        if (generation !== turnGeneration.current) return;
        if (responseId === null) {
          responseId = turnStartedAt + 1;
          const msg: Message = {
            id: responseId, session_id: sid ?? activeId ?? '',
            role: 'assistant', content: chunk, ts: Date.now(),
          };
          setMessages(prev => [...prev, msg]);
          setStreamingMsgId(responseId);
        } else {
          const id = responseId;
          setMessages(prev => prev.map(message => (
            message.id === id
              ? { ...message, content: replace ? chunk : message.content + chunk }
              : message
          )));
        }
        setThinkingByMessage(prev => ({
          ...prev,
          [responseId!]: {
            toolCalls: turnTools,
            activities: turnActivities,
            startedAt: turnStartedAt,
            durationMs: Date.now() - turnStartedAt,
          },
        }));
        setPendingTools([]);
        setPendingActivities([]);
        setTimeout(scrollToBottom, 50);
      },
      onDone: (sid, code, status) => {
        if (generation !== turnGeneration.current) return;
        if (code !== 0 && status !== 'cancelled') setPendingActivities([{ label: 'Request failed', detail: 'See the saved response for details', state: 'complete' }]);
        setActiveId(sid);
        setLoading(false);
        setStreamingMsgId(null);
        setThinkingStartedAt(null);
        stopRef.current = null;
        if (responseId !== null) {
          const id = responseId;
          setThinkingByMessage(prev => ({
            ...prev,
            [id]: {
              toolCalls: turnTools,
              activities: turnActivities,
              startedAt: turnStartedAt,
              durationMs: Date.now() - turnStartedAt,
            },
          }));
        }
        refreshSessions().catch(() => setStartupError('Could not refresh conversations. Retry when the backend is available.'));
      },
      onError: msg => {
        if (generation !== turnGeneration.current) return;
        const errorId = responseId ?? turnStartedAt + 1;
        setMessages(prev => responseId === null ? [...prev, {
          id: errorId, session_id: activeId ?? '',
          role: 'assistant', content: `**Error:** ${msg}`, ts: Date.now(),
        }] : prev.map(message => message.id === errorId ? { ...message, content: `${message.content}\n\n**Error:** ${msg}` } : message));
        setThinkingByMessage(prev => ({
          ...prev,
          [errorId]: {
            toolCalls: turnTools,
            activities: turnActivities,
            startedAt: turnStartedAt,
            durationMs: Date.now() - turnStartedAt,
          },
        }));
        setLoading(false); stopRef.current = null; setPendingTools([]); setPendingActivities([]); setThinkingStartedAt(null);
        setStreamingMsgId(null);
      },
    });
    stopRef.current = stop;
    return true;
  };

  const handleStop = () => {
    stopRef.current?.();
    if (!stopRef.current) { turnGeneration.current++; setLoading(false); }
  };

  const isEmpty = messages.length === 0 && !loading;
  const currentSession = sessions.find(s => s.id === activeId);
  const workspaceSessions = sessions.filter(session => session.workspaceId === activeWorkspaceId);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {startupError && <div role="alert" style={{ position: 'fixed', top: 65, left: '25%', right: '25%', zIndex: 100, padding: 14, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--red)', borderRadius: 8 }}>{startupError} <button onClick={() => window.location.reload()}>Retry</button></div>}

      {/* ── Left sidebar ── */}
      {leftOpen ? (
        <Sidebar
          sessions={workspaceSessions}
          activeSessionId={activeId}
          activeNav={activeNav}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={id => { setView('chat'); selectWorkspace(id); }}
          onCreateWorkspace={createWorkspace}
          onNavChange={setActiveNav}
          onSelect={id => { setView('chat'); void loadSession(id); }}
          onNew={() => { setView('chat'); newChat(); }}
          onDelete={deleteSession}
          onCollapse={() => setLeftOpen(false)}
        />
      ) : null}

      {/* ── Centre: header + chat + composer ── */}
      <div className="chat-workbench" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div className="app-header" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 20px',
          height: 56,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          {!leftOpen && (
            <button className="icon-button" onClick={() => setLeftOpen(true)} aria-label="Open navigation" title="Open navigation">
              <PanelLeftOpen size={17} />
            </button>
          )}
          <img src="/bob-logo.png" alt="Bob" style={{ width: 34, height: 34, flexShrink: 0, objectFit: 'contain', borderRadius: 7 }} />
          <div className="team-heading" style={{ minWidth: 0, marginRight: 2, flex: 1 }}>
            <span title="Bob Board" style={{ display: 'block', fontSize: 'calc(var(--base-font-size) * 17 / 14)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Bob Board</span>
            <span className="team-subtitle" style={{ display: 'block', marginTop: 1, fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--muted)' }}>Beta · Vault &amp; Boundary Support</span>
          </div>
          <button className="shell-launcher" disabled={loading} aria-label={view === 'shell' ? 'Return to chat' : 'Open Bob Shell'} aria-pressed={view === 'shell'} title={view === 'shell' ? 'Return to chat' : 'Open Bob Shell'} onClick={() => setView(view === 'shell' ? 'chat' : 'shell')}>
            <Terminal size={17} />
          </button>
          {!rightOpen && view === 'chat' && (
            <button className="icon-button" onClick={() => setRightOpen(true)} aria-label="Open code viewer" title="Open code viewer">
              <PanelRightOpen size={17} />
            </button>
          )}

          <button className="icon-button" onClick={() => setPersonalizationOpen(true)} aria-label="Customize appearance and layout" title="Customize appearance and layout">
            <Palette size={17} />
          </button>
          <details className="header-more" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
            <summary className="icon-button" aria-label="More views" title="More views"><MoreHorizontal size={18} /></summary>
            <div className="header-more-menu">
              {([['chat', 'Chat'], ['models', 'Model test'], ['ide', 'IDE history'], ['connection', 'Connect IBMid']] as const).map(([id, label]) => <button key={id} disabled={loading} aria-current={view === id ? 'page' : undefined} onClick={event => { setView(id); const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; }}>{label}</button>)}
            </div>
          </details>
        </div>

        {/* Messages area */}
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 0' }}>
          <div className="chat-column">
            {view === 'connection' ? <GatewayConnection /> : view === 'models' ? <ModelLab /> : view === 'shell' ? <ShellPrototype key={activeWorkspaceId} workspaceId={activeWorkspaceId} workspace={workspaces.find(item => item.id === activeWorkspaceId)?.name || 'Workspace'} /> : view === 'ide' ? <IdeHistory /> : isEmpty ? (
              <EmptyState onSuggestion={msg => sendMessage({ message: msg, mode, mcps: [] })} />
            ) : (
              <>
                {messages.map(m => (
                  <Fragment key={m.id}>
                    {m.role === 'assistant' && thinkingByMessage[m.id] && (
                      <ThinkingBlock
                        toolCalls={thinkingByMessage[m.id].toolCalls}
                        activities={thinkingByMessage[m.id].activities}
                        isLive={loading && m.id === streamingMsgId}
                        startedAt={thinkingByMessage[m.id].startedAt}
                        durationMs={thinkingByMessage[m.id].durationMs}
                      />
                    )}
                    <ChatMessage
                      message={m}
                      streaming={m.id === streamingMsgId}
                      onStreamingDone={() => setStreamingMsgId(current => current === m.id ? null : current)}
                      onStreamingProgress={followStreamingMessage}
                      onOpenFile={filePath => void openSourceFile(filePath)}
                      onOpenResource={url => void openResource(url)}
                      resourceUrls={confluenceUrlsFromTools(thinkingByMessage[m.id]?.toolCalls)}
                    />
                  </Fragment>
                ))}
                {loading && streamingMsgId === null && (
                  <ThinkingBlock
                    toolCalls={pendingTools}
                    activities={pendingActivities}
                    isLive
                    startedAt={thinkingStartedAt ?? undefined}
                  />
                )}
                <div ref={bottomRef} style={{ height: 8 }} />
              </>
            )}
          </div>
        </div>

        {/* Session title when active */}
        {currentSession && view === 'chat' && (
          <div style={{ padding: '0 24px 4px', fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)' }}>
            <div className="session-column">{currentSession.title}</div>
          </div>
        )}

        {/* Composer */}
        <div style={{ padding: '0 24px', flexShrink: 0, display: view === 'chat' ? undefined : 'none' }}>
          <div className="composer-column">
            <Composer
              modelControls={<div className="engine-controls">
                <span className="gateway-label">OpenCode · {providerName(selectedModel.split('/')[0])}</span>
                <ModelPicker models={modelCatalog} selected={selectedModel} disabled={loading} error={modelError} onSelect={id => { setSelectedModel(id); try { localStorage.setItem('v3-selected-model', id); } catch {} }} />
                <SessionUsageBadge usage={sessionUsage} />
                <details className="engine-help"><summary>About</summary><p className="engine-note">Selected MCPs and skill are passed to OpenCode. Standard permissions allow reads and configured MCP preapprovals; other actions are denied. No interactive approvals yet. Local OpenCode configuration also applies.</p></details>
                {modelError && <p role="alert">{modelError}</p>}
              </div>}
              onSubmit={sendMessage}
              key={`${activeWorkspaceId}:${composerGeneration}`}
              onStop={handleStop}
              loading={loading}
              modes={modes}
              skills={skills}
              mcps={mcps}
              profiles={supportProfiles}
              selectedProfileId={supportProfileId}
              onProfileChange={selectSupportProfile}
              currentMode={mode}
              onModeChange={setMode}
              presetSkill={presetSkill || undefined}
              onPresetSkillUsed={() => setPresetSkill('')}
            />
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      {rightOpen && view === 'chat' ? (
        <RightPanel
          width={personalization.rightPanelWidth}
          onWidthChange={width => setPersonalization(current => ({ ...current, rightPanelWidth: width }))}
          files={sourceFiles}
          activeFilePath={activeSourcePath}
          loading={sourceFileLoading}
          error={sourceFileError}
          confluencePage={confluencePage}
          resourceLoading={resourceLoading}
          resourceError={resourceError}
          resourceUrl={resourceUrl}
          activeTab={activeViewer}
          onActiveTabChange={setActiveViewer}
          onOpenMcpConfig={() => void openMcpConfig()}
          onActiveFileChange={path => { setActiveSourcePath(path); setActiveViewer('file'); setSourceFileError(''); }}
          onCloseFile={path => {
            setSourceFiles(current => {
              const remaining = current.filter(file => file.path !== path);
              if (activeSourcePath === path) setActiveSourcePath(remaining.at(-1)?.path || '');
              return remaining;
            });
            setSourceFileError('');
          }}
          onCloseResource={() => { setConfluencePage(null); setResourceUrl(''); setResourceError(''); setActiveViewer('file'); }}
          onOpenResource={url => void openResource(url)}
          onCollapse={() => setRightOpen(false)}
        />
      ) : null}
      <PersonalizationPanel
        open={personalizationOpen}
        workspaceName={workspaces.find(workspace => workspace.id === activeWorkspaceId)?.name ?? 'this workspace'}
        settings={personalization}
        onChange={updatePersonalization}
        onClose={() => setPersonalizationOpen(false)}
        onReset={resetPersonalization}
      />
    </div>
  );
}

const SUGGESTIONS = [
  { label: 'Investigate a Vault issue', sub: 'Symptoms, logs and product version' },
  { label: 'Troubleshoot Boundary', sub: 'Controllers, workers and connectivity' },
  { label: 'Draft a customer response', sub: 'Findings and clear next steps' },
  { label: 'Plan a reproduction', sub: 'Environment, scenario and project files' },
];

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      padding: '0 24px 40px',
    }}>
      {/* Hero image */}
      <img
        src="/bob-board-hero.png"
        alt="Bob Board — mission control"
        style={{
          width: '100%',
          maxHeight: 220,
          objectFit: 'cover',
          objectPosition: 'center 30%',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          display: 'block',
        }}
      />

      {/* Welcome card — styled like a Navi system message */}
      <div style={{
        width: '100%',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface3)',
        }}>
          <img src="/bob-logo.png" alt="Bob" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, opacity: 0.9 }} />
          <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.04em', flex: 1 }}>BOB</span>
        </div>
        <div style={{ padding: '16px', fontSize: 'calc(var(--base-font-size) * 14 / 14)', color: 'var(--text)', lineHeight: 1.75 }}>
          Hi, I'm Bob — your IBM AI assistant. I can help you with code, infrastructure, security analysis,
          Vault &amp; Boundary support, documentation, and more. What would you like to work on?
        </div>
      </div>

      {/* Suggestion grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        width: '100%',
      }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s.label}
            onClick={() => onSuggestion(s.label)}
            style={{
              textAlign: 'left', padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              cursor: 'pointer', transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: 'calc(var(--base-font-size) * 13 / 14)', fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)', lineHeight: 1.4 }}>{s.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
