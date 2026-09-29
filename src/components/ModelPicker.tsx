import { useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export function providerName(id: string) {
  return ({ 'ibm-bob': 'IBM Bob Gateway', openai: 'OpenAI', anthropic: 'Anthropic' } as Record<string, string>)[id] || id || 'Models';
}
function label(id: string) {
  const name = id.slice(id.indexOf('/') + 1);
  return ({
    'fast': 'Bob · Fast',
    'premium': 'Bob · Premium (Sonnet 4.5)',
    'premium-ide': 'Bob · Premium IDE (Sonnet 4.6)',
    'premium-shell': 'Bob · Premium Shell (Sonnet 4.6)',
    'ultra': 'Bob · Ultra',
    'explorer': 'Explorer (Haiku 4.5)',
    'background': 'Bob · Background',
    'security': 'Bob · Security',
    'sonnet-4.5': 'Claude Sonnet 4.5',
    'wxO-model': 'WatsonX Orchestrate',
    'gpt-oss-20b': 'GPT-OSS 20B',
    'openai/gpt-oss-20b': 'GPT-OSS 20B (OpenAI)',
    'granite-8b-code-instruct': 'Granite 8B Code Instruct',
    'rnj-1-test': 'RNJ-1 Test',
    'rnj-1-nextedit-v1-0': 'RNJ-1 NextEdit',
  } as Record<string, string>)[name] || name;
}
function tested(id: string) { return ['ibm-bob/fast', 'ibm-bob/premium'].includes(id); }
function readHidden(): string[] {
  try { const value = JSON.parse(localStorage.getItem('v3-hidden-models') || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; } catch { return []; }
}
export function ModelPicker({ models, selected, disabled, error, onSelect }: { models: string[]; selected: string; disabled: boolean; error: string; onSelect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(readHidden);
  const shown = models.filter(id => (manage || id === selected || !hidden.includes(id)) && `${providerName(id.split('/')[0])} ${label(id)} ${id}`.toLowerCase().includes(query.toLowerCase()));
  function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id];
    setHidden(next); try { localStorage.setItem('v3-hidden-models', JSON.stringify(next)); } catch {}
  }
  return <>
    <button className="model-picker-trigger" disabled={disabled} onClick={() => { setManage(false); setQuery(''); dialog.current?.showModal(); }} aria-haspopup="dialog">{selected ? label(selected) : error ? 'Models unavailable' : 'Loading models…'}<ChevronDown size={13} /></button>
    <dialog ref={dialog} className="model-picker-dialog" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <header><strong>{manage ? 'Manage models' : 'Choose a model'}</strong><button aria-label="Close model picker" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
      <input autoFocus aria-label="Search models" placeholder="Search models…" value={query} onChange={event => setQuery(event.target.value)} />
      {manage && <p>Choose which models appear in your picker. Your current model stays visible. Only IBM Bob Gateway models are available in this dashboard. These preferences apply only to V3.</p>}
      <div className="model-picker-list">
        {[...new Set(shown.map(id => id.split('/')[0]))].map(provider => <section key={provider}><h3>{providerName(provider)}</h3>{shown.filter(id => id.startsWith(provider + '/')).map(id => <div className="model-picker-row" key={id}>
          {manage ? <label><span>{label(id)}<small>{id} · {tested(id) ? 'Basic V3 test passed' : 'Not yet tested in V3'}</small></span><input type="checkbox" aria-label={`Show ${id}`} checked={id === selected || !hidden.includes(id)} disabled={id === selected} onChange={() => toggle(id)} /></label> : <button disabled={disabled} aria-pressed={selected === id} onClick={() => { onSelect(id); dialog.current?.close(); }}><span>{label(id)}<small>{id} · {tested(id) ? 'Basic V3 test passed' : 'Not yet tested in V3'}</small></span><span>{selected === id ? '✓' : ''}</span></button>}
        </div>)}</section>)}
        {!shown.length && <p>{error || (models.length ? 'No matching visible models. Try Manage models.' : 'Loading connected models…')}</p>}
      </div>
      <footer><button onClick={() => { setManage(!manage); setQuery(''); }}>{manage ? 'Back to model picker' : 'Manage models'}</button><span>Listed does not guarantee access or tool compatibility.</span></footer>
    </dialog>
  </>;
}
