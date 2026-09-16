import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Folder, LockKeyhole, Play, RefreshCw, ShieldCheck, SquareTerminal, Trash2 } from 'lucide-react';
import { api, streamShell } from '../legacy-api';
import type { ShellSession } from '../types';
function mergeStreamText(current: string, next: string) { return next.startsWith(current) ? next : current.endsWith(next) ? current : current + next; }
export function ShellPrototype({ workspace, workspaceId }: { workspace: string; workspaceId: string }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [sessionId, setSessionId] = useState<string>();
  const [shellSessions, setShellSessions] = useState<ShellSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [shellMode, setShellMode] = useState<'ask' | 'agent'>('ask');
  const [agentAcknowledged, setAgentAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [error, setError] = useState('');
  const shellStopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => shellStopRef.current?.(), []);

  const loadShellSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      setShellSessions(await api.shellSessions(workspaceId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Bob Shell sessions.');
    } finally {
      setSessionsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setSessionId(undefined);
    setResponse('');
    setActivity([]);
    setError('');
    void loadShellSessions();
  }, [loadShellSessions]);

  const runTask = () => {
    const prompt = query.trim();
    if (!prompt || running) return;
    if (shellMode === 'agent' && !agentAcknowledged) {
      setError('Confirm Agent permissions before starting this task.');
      return;
    }

    setQuery('');
    setResponse('');
    setActivity([]);
    setError('');
    setRunning(true);

    shellStopRef.current = streamShell({
      message: prompt,
      sessionId,
      mode: shellMode,
      workspaceId,
      confirmAgent: shellMode === 'agent' && agentAcknowledged,
      mcps: [],
      onSession: id => {
        if (id) setSessionId(id);
      },
      onActivity: event => setActivity(current => [...current, event.detail ? `${event.label} · ${event.detail}` : event.label]),
      onToolCall: event => setActivity(current => [...current, `Using ${event.name}`]),
      onText: chunk => setResponse(current => mergeStreamText(current, chunk)),
      onDone: (id, exitCode) => {
        if (id) setSessionId(id);
        setRunning(false);
        shellStopRef.current = null;
        if (exitCode !== 0) setError(`Bob Shell exited with code ${exitCode}.`);
        void loadShellSessions();
      },
      onError: message => {
        setError(message);
        setRunning(false);
        shellStopRef.current = null;
      },
    });
  };

  const stopTask = () => {
    shellStopRef.current?.();
    shellStopRef.current = null;
    setRunning(false);
    setActivity(current => [...current, 'Run stopped locally']);
  };

  const deleteSelectedSession = async () => {
    if (!sessionId || running) return;
    const selected = shellSessions.find(item => item.id === sessionId);
    if (!window.confirm(`Delete the Bob Shell session “${selected?.title || sessionId}”? This cannot be undone.`)) return;
    try {
      await api.deleteShellSession(sessionId, workspaceId);
      setSessionId(undefined);
      setResponse('');
      setActivity([]);
      await loadShellSessions();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the Bob Shell session.');
    }
  };

  const steps = [
    ['Workspace mounted', workspace, true],
    ['Local backend', '127.0.0.1:3100', true],
    ['Bob Shell worker', running ? 'Working on your task' : sessionId ? 'Session ready to continue' : 'Ready to receive a task', running],
  ] as const;

  return (
    <div style={{ padding: '8px 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)' }}><SquareTerminal size={20} /></div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 'calc(var(--base-font-size) * 20 / 14)', lineHeight: 1.2, letterSpacing: '-0.03em', color: 'var(--text)' }}>Bob Shell</h1>
          <p style={{ marginTop: 4, color: 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 13 / 14)' }}>Native local sessions with workspace-scoped access.</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, border: '1px solid var(--green)', color: 'var(--green)', background: 'var(--green-soft)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontWeight: 650 }}><ShieldCheck size={13} /> Local backend</span>
      </div>

      <div className="shell-experiment-grid">
        <section style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface3)' }}>
            <Folder size={14} color="var(--accent)" />
            <span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontWeight: 650, color: 'var(--text)' }}>{workspace}</span>
            <select
              value={sessionId || ''}
              onChange={event => {
                setSessionId(event.target.value || undefined);
                setResponse('');
                setActivity([]);
                setError('');
              }}
              disabled={running || sessionsLoading}
              aria-label="Bob Shell session"
              style={{ marginLeft: 'auto', minWidth: 170, maxWidth: 260, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 7px', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)' }}
            >
              <option value="">{sessionsLoading ? 'Loading sessions…' : '＋ New session'}</option>
              {shellSessions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.age}</option>)}
            </select>
            <button onClick={() => void loadShellSessions()} disabled={running || sessionsLoading} className="icon-button" title="Refresh sessions" aria-label="Refresh Bob Shell sessions" style={{ width: 28, height: 28 }}><RefreshCw size={13} /></button>
            <button onClick={() => void deleteSelectedSession()} disabled={!sessionId || running} className="icon-button" title="Delete selected session" aria-label="Delete selected Bob Shell session" style={{ width: 28, height: 28, color: sessionId ? 'var(--danger)' : 'var(--muted)' }}><Trash2 size={13} /></button>
          </div>
          <div style={{ padding: '15px 16px', minHeight: 230, maxHeight: 390, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 'calc(var(--base-font-size) * 12 / 14)', lineHeight: 1.65, color: 'var(--text2)', background: 'var(--code-bg)' }}>
            <div style={{ color: '#8dd7a9' }}>$ bob shell</div>
            {!response && !running && !error && <div style={{ color: '#aeb8ca' }}>Worker ready. Ask Bob to inspect this workspace or propose a change.</div>}
            {running && !response && <div style={{ marginTop: 8, color: '#8fb8ff' }}>Bob is working…</div>}
            {response && <div style={{ marginTop: 10, color: '#dbe7ff' }}>{response}</div>}
            {error && <div style={{ marginTop: 10, color: '#ff8f94' }}>{error}</div>}
            {running && <span style={{ display: 'inline-block', width: 7, height: '1.1em', marginTop: 5, background: '#8fb8ff', verticalAlign: 'text-bottom', animation: 'cursorBlink 0.8s step-end infinite' }} />}
          </div>
          {shellMode === 'agent' && !agentAcknowledged && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '10px 10px 0', padding: '9px 10px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--amber) 55%, transparent)', background: 'color-mix(in srgb, var(--amber) 10%, var(--surface2))' }}>
              <AlertTriangle size={15} color="var(--amber)" style={{ flex: '0 0 auto', marginTop: 1 }} />
              <label style={{ display: 'flex', gap: 7, fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', lineHeight: 1.45, color: 'var(--text2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={agentAcknowledged} onChange={event => setAgentAcknowledged(event.target.checked)} />
                I understand Agent mode can modify files and run commands non-interactively inside this workspace.
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderTop: '1px solid var(--border)', marginTop: shellMode === 'agent' && !agentAcknowledged ? 10 : 0 }}>
            <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 7 }}>
              {(['ask', 'agent'] as const).map(item => (
                <button
                  key={item}
                  onClick={() => { setShellMode(item); setError(''); }}
                  disabled={running}
                  style={{ border: 0, borderRadius: 5, padding: '5px 9px', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', fontWeight: 650, textTransform: 'capitalize', color: shellMode === item ? 'var(--text)' : 'var(--muted)', background: shellMode === item ? 'var(--surface)' : 'transparent', boxShadow: shellMode === item ? '0 1px 3px rgba(0,0,0,.18)' : 'none', cursor: running ? 'default' : 'pointer' }}
                >{item}</button>
              ))}
            </div>
            <textarea
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  runTask();
                }
              }}
              disabled={running}
              placeholder={sessionId ? `Continue this ${shellMode === 'ask' ? 'read-only ' : ''}Bob Shell session…` : `Start a ${shellMode === 'ask' ? 'read-only ' : ''}Bob Shell session…`}
              rows={1}
              style={{ flex: 1, resize: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'calc(var(--base-font-size) * 12 / 14)', padding: '7px 9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, outline: 'none' }}
            />
            <button
              onClick={running ? stopTask : runTask}
              disabled={!running && (!query.trim() || (shellMode === 'agent' && !agentAcknowledged))}
              className={running ? 'stop-button' : 'primary-action'}
              style={{ width: 34, height: 32, border: 'none', borderRadius: 7, display: 'grid', placeItems: 'center' }}
              title={running ? 'Stop Bob Shell' : 'Run task'}
            >
              {running ? <SquareTerminal size={14} /> : <Play size={14} />}
            </button>
          </div>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}><CheckCircle2 size={14} color="var(--green)" /><span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontWeight: 650 }}>Worker activity</span></div>
            {steps.map(([title, detail, done]) => <div key={title} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: done ? 'var(--green)' : 'var(--accent)', paddingTop: 1 }}>{done ? '✓' : '◌'}</span>
              <div><div style={{ fontSize: 'calc(var(--base-font-size) * 11.5 / 14)', color: 'var(--text)' }}>{title}</div><div style={{ fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', color: 'var(--muted)', marginTop: 1 }}>{detail}</div></div>
            </div>)}
            {activity.slice(-5).map((item, index) => (
              <div key={`${item}-${index}`} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', color: 'var(--text2)', lineHeight: 1.4 }}>{item}</div>
            ))}
          </section>
          <section style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}><LockKeyhole size={14} color="var(--amber)" /><span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontWeight: 650 }}>Permissions</span></div>
            <p style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', lineHeight: 1.5, color: 'var(--text2)' }}><strong style={{ color: 'var(--green)' }}>Ask</strong> is the safe default and does not auto-approve actions. <strong style={{ color: 'var(--amber)' }}>Agent</strong> can modify the selected workspace only after explicit confirmation.</p>
            <div style={{ marginTop: 9, padding: '7px 8px', borderRadius: 7, background: 'var(--surface3)', color: 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)' }}>Runs are local, authenticated, cancellable, time-limited, and output-limited.</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
