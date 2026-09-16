import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../legacy-api';
import type { Session, SessionDetail } from '../types';

export function IdeHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<SessionDetail>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    api.ideSessions().then(items => { if (active) setSessions(items); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; generation.current++; };
  }, []);
  async function select(id: string) {
    const current = ++generation.current;
    setSelected(id); setDetail(undefined); setError('');
    if (!id) return;
    setBusy(true);
    try { const value = await api.ideSession(id); if (current === generation.current) setDetail(value); }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Could not load IDE conversation.'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <section className="ide-history">
    <h2>Bob IDE history</h2>
    <p>Read-only conversations from your local Bob IDE. Continue these conversations in the IDE; nothing here writes to its database.</p>
    <label>IDE conversation<select aria-label="IDE conversation" value={selected} onChange={e => void select(e.target.value)}>
      <option value="">{busy && !sessions.length ? 'Loading…' : 'Choose a conversation'}</option>
      {sessions.map(item => <option key={item.id} value={item.id}>{item.title.slice(0, 120)}</option>)}
    </select></label>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading IDE history…</p>}
    {!busy && !error && !sessions.length && <p>No IDE conversations found.</p>}
    {detail && <><h3>{detail.title.slice(0, 160)}</h3>{detail.messages.map(message => <article key={message.id}><strong>{message.role === 'user' ? 'You' : 'Bob'}</strong><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => <span>[Open images in Bob IDE]</span> }}>{message.content}</ReactMarkdown></article>)}</>}
  </section>;
}
