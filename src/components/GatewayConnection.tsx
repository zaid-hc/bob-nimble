import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
type Status = Awaited<ReturnType<typeof api.gatewayStatus>>;
export function GatewayConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginURL, setLoginURL] = useState('');
  const [choice, setChoice] = useState('');
  const loginTab = useRef<Window | null>(null);
  const autoOpened = useRef(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const instanceID = status?.selected?.instanceID;
  const teamID = status?.selected?.teamID;
  useEffect(() => {
    let active = true;
    setCatalog([]); setCatalogError(''); setCatalogLoading(false);
    if (!status?.connected || !instanceID || !teamID) return;
    setCatalogLoading(true);
    api.gatewayModels().then(result => {
      if (active && result.profile.instanceID === instanceID && result.profile.teamID === teamID) setCatalog(result.models);
    }).catch(failure => { if (active) setCatalogError(failure.message); }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [status?.connected, instanceID, teamID, catalogRefresh]);
  useEffect(() => {
    let active = true;
    const update = () => api.gatewayStatus().then(value => { if (active) {
      setStatus(value);
      if (!value.pending) setLoginURL('');
      if (value.connected && autoOpened.current) {
        try { loginTab.current?.close(); window.focus(); } catch {}
        loginTab.current = null; autoOpened.current = false;
      }
    } }).catch(() => { if (active) setError('Cannot reach the V3 connection service.'); });
    void update(); const timer = setInterval(update, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); setStatus(await api.gatewayStatus()); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Connection failed.'); } finally { setBusy(false); } }
  function signIn() {
    // Open during the click gesture, before awaiting the login URL, so browsers
    // do not mistake this for an unsolicited popup. Remove opener access.
    const tab = window.open('about:blank', '_blank');
    loginTab.current = tab; autoOpened.current = !!tab; setPopupBlocked(!tab);
    if (tab) tab.opener = null;
    void run(async () => {
      try {
        const result = await api.gatewayLogin(); setLoginURL(result.url);
        if (tab && !tab.closed) tab.location.replace(result.url);
        else setPopupBlocked(true);
      } catch (failure) { tab?.close(); loginTab.current = null; autoOpened.current = false; throw failure; }
    });
  }
  return <section className="model-lab">
    <h2>Connect IBMid <span>Direct Gateway setup</span></h2>
    <p>This separate Bob connection does not use your OpenCode credentials. Sign-in is held in backend memory and expires when V3 restarts. Disconnect clears this V3 connection only; it does not sign you out of IBMid in your browser.</p>
    <p><strong>Live chat still uses OpenCode.</strong> The catalog below comes directly from your selected Bob profile, without OpenCode or cached fallback models. Direct chat and MCP execution are not connected yet, so these entries are not automatically added to the chat picker.</p>
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    {!status?.connected && <button disabled={busy || status?.pending} onClick={signIn}>{status?.pending ? 'Waiting for IBMid sign-in…' : 'Sign in with IBMid'}</button>}
    {loginURL && <p>{popupBlocked ? 'Your browser blocked the sign-in tab. ' : 'Sign-in opened in a new tab. '}<a href={loginURL} target="_blank" rel="noreferrer">Open IBMid sign-in ↗</a></p>}
    {status?.connected && <>
      <p>Signed in. Choose the instance and team for direct Gateway requests.</p>
      <label>Instance / team<select aria-label="Bob instance and team" value={choice} onChange={event => setChoice(event.target.value)}><option value="">Select a profile…</option>{status.profiles.map((item, index) => <option key={`${item.instanceID}:${item.teamID}`} value={String(index)}>{item.label}</option>)}</select></label>
      {!status.profiles.length && <p>No usable regional profiles were returned. Do not continue until your Bob profile is available.</p>}
      <button disabled={busy || !status.profiles[Number(choice)] || choice === ''} onClick={() => void run(() => { const profile = status.profiles[Number(choice)]; return api.gatewaySelect(profile.instanceID, profile.teamID); })}>Use selected profile</button>
      {status.selected && <p role="status">Profile selected: {status.profiles.find(item => item.instanceID === status.selected?.instanceID && item.teamID === status.selected?.teamID)?.label}</p>}
      {status.selected && <section aria-label="Direct Bob Gateway models">
        <h3>Models from your Bob Gateway</h3>
        <button disabled={catalogLoading} onClick={() => setCatalogRefresh(value => value + 1)}>Refresh catalog</button>
        <input aria-label="Search direct Gateway models" placeholder="Search models…" value={search} onChange={event => setSearch(event.target.value)} style={{ width: '100%', padding: 10, marginTop: 12, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 7, font: 'inherit' }} />
        {catalogLoading ? <p role="status">Loading directly from Bob Gateway…</p> : catalogError ? <p role="alert">{catalogError}</p> : <>
          <p>{catalog.length} models returned by your selected instance and team. Listing does not guarantee inference access or MCP compatibility.</p>
          <ul style={{ maxHeight: 320, overflowY: 'auto', listStyle: 'none', padding: 0 }}>{catalog.filter(id => id.toLowerCase().includes(search.toLowerCase())).map(id => <li key={id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>{id.replace('ibm-bob/', '')}<small style={{ display: 'block', color: 'var(--muted)' }}>{id}</small></li>)}</ul>
          {catalog.length > 0 && !catalog.some(id => id.toLowerCase().includes(search.toLowerCase())) && <p>No matching models.</p>}
        </>}
      </section>}
    </>}
    {(status?.connected || status?.pending) && <button disabled={busy} onClick={() => void run(async () => { await api.gatewayLogout(); loginTab.current?.close(); loginTab.current = null; autoOpened.current = false; setLoginURL(''); setChoice(''); })}>{status.pending ? 'Cancel sign-in' : 'Disconnect'}</button>}
  </section>;
}
