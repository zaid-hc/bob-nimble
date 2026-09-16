import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Turn = { role: string; text: string; model: string };
let catalog: Promise<{ token: string; models: string[] }> | undefined;
function loadCatalog() {
  return catalog ??= (async () => {
    const auth = await fetch('/model-lab/auth');
    if (!auth.ok) throw new Error('V3 model test is not available.');
    const { token } = await auth.json();
    const response = await fetch('/model-lab/models', { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return { token, models: result.models as string[] };
  })().catch(error => { catalog = undefined; throw error; });
}
export function ModelLab() {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('What is the difference between a variable and a constant in programming?');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading Bob models…');
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState<number | null>(null);
  const token = useRef(''); const session = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const result = await loadCatalog();
      token.current = result.token;
      if (mounted) { setModels(result.models); setModel(result.models.includes('ibm-bob/fast') ? 'ibm-bob/fast' : result.models[0]); setStatus('Ready'); }
    })().catch(e => { if (mounted) setError(e.message); });
    return () => { mounted = false; abort.current?.abort(); };
  }, []);
  async function send() {
    if (busy || !model || !prompt.trim()) return;
    setBusy(true); setError(''); setTokens(null); setStatus('Waiting for Bob…');
    const message = prompt; setPrompt('');
    setTurns(old => [...old, { role: 'You', text: message, model }, { role: 'Bob', text: '', model }]);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch('/model-lab/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.current}` }, body: JSON.stringify({ message, model, sessionId: session.current }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error((await response.json()).error || 'Could not start the test.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let doneSeen = false;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        pending += decoder.decode(part.value, { stream: true });
        const lines = pending.split('\n'); pending = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === 'session') session.current = event.id;
          if (event.type === 'text') setTurns(old => old.map((turn, index) => index === old.length - 1 ? { ...turn, text: turn.text + event.text } : turn));
          if (event.type === 'usage') setTokens(event.tokens);
          if (event.type === 'error') setError(event.error);
          if (event.type === 'done') { doneSeen = true; setStatus(event.status === 'complete' ? 'Complete' : event.status === 'stopped' ? 'Stopped (or reached the 2-minute limit)' : 'Test failed'); if (event.status === 'failed') setError(old => old || 'The model did not complete a response.'); }
        }
      }
      if (!doneSeen) throw new Error('The connection ended before Bob confirmed completion.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Test failed'); setStatus('Not completed'); }
    finally { setBusy(false); abort.current = null; }
  }
  async function stop() {
    setStatus('Stopping…');
    try { const response = await fetch('/model-lab/cancel', { method: 'POST', headers: { Authorization: `Bearer ${token.current}` } }); if (!response.ok) throw new Error('Could not confirm cancellation.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not stop.'); }
  }
  return <section className="model-lab" aria-label="Bob model test">
    <h2>Model test <span>V3 experiment</span></h2>
    <p>Try Bob Gateway models before connecting them to the support workflow. Use non-sensitive prompts. Tool calls are denied; dashboard MCP selections, skills, attachments, and workspace files are not connected in this test.</p>
    <div className="model-lab-controls">
      <label>Bob model<select value={model} disabled={busy || !models.length} onChange={e => { setModel(e.target.value); session.current = undefined; setStatus('New model · new session'); }}>{models.map(id => <option key={id} value={id}>{id.replace('ibm-bob/', '')}</option>)}</select></label>
      <button disabled={busy} onClick={() => { session.current = undefined; setTurns([]); setTokens(null); setError(''); setStatus('Ready'); }}>New test</button>
    </div>
    <p className="model-lab-note">Model availability is confirmed when a request succeeds. Test conversations are stored by local OpenCode, separately from your dashboard chats. Switching models starts a new session.</p>
    <div className="model-lab-turns" aria-live="polite">{turns.map((turn, index) => <article key={index}><strong>{turn.role}</strong><small>{turn.model.replace('ibm-bob/', '')}</small><div><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => <span>[Image omitted in model test]</span> }}>{turn.text || (busy ? 'Waiting for a response…' : 'No response')}</ReactMarkdown></div></article>)}</div>
    {error && <p role="alert" className="model-lab-error">{error}</p>}
    <label className="model-lab-prompt">Test prompt<textarea rows={4} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} maxLength={8000} /></label>
    <div className="model-lab-controls"><span role="status">{status}{tokens !== null ? ` · ${tokens.toLocaleString()} tokens reported` : ''}</span>{busy ? <button onClick={stop}>Stop</button> : <button className="primary-action" disabled={!model || !prompt.trim()} onClick={send}>Send test</button>}</div>
  </section>;
}
