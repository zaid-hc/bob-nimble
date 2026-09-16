import { type FC, type ReactNode, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, File, Folder, Plus, SlidersHorizontal, Square, X } from 'lucide-react';
import type { Mode, Skill, Mcp, SupportProfile } from '../types';

interface Props {
  modelControls?: ReactNode;
  onSubmit:     (opts: { message: string; mode: string; skill?: string; mcps: string[]; files: File[]; automaticActions: boolean }) => Promise<boolean>;
  onStop:       () => void;
  loading:      boolean;
  modes:        Mode[];
  skills:       Skill[];
  mcps:         Mcp[];
  profiles: SupportProfile[];
  selectedProfileId: string;
  onProfileChange: (id: string) => void;
  currentMode:  string;
  onModeChange: (mode: string) => void;
  /** Pre-set a skill from an external source (right panel) */
  presetSkill?: string;
  onPresetSkillUsed?: () => void;
}

export const Composer: FC<Props> = ({
  onSubmit, onStop, loading, modelControls,
  modes, skills, mcps, profiles, selectedProfileId, onProfileChange,
  currentMode, onModeChange,
  presetSkill, onPresetSkillUsed,
}) => {
  const [text,         setText]         = useState('');
  const [activeSkill,  setActiveSkill]  = useState('');
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
  const [showProfileTools, setShowProfileTools] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [automaticActions, setAutomaticActions] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const profile = profiles.find(item => item.id === selectedProfileId);
  const effectiveMcps = useMemo(() => [...new Set([...(profile?.mcps ?? []), ...selectedMcps])], [profile, selectedMcps]);
  const selectableMcps = mcps.filter(mcp => selectedProfileId === 'custom' || !profile?.mcps.includes(mcp.name));
  const toolSuggestions = [
    { name: 'vault-support-mcp',              label: 'Vault Docs',             matches: /\bvault\b/i },
    { name: 'vault-enterprise-support-mcp',   label: 'Vault Enterprise Docs',  matches: /\bvault\s+enterprise\b|\bhcp\s+vault\b|\bvault\s+(?:plus|premium)\b/i },
    { name: 'boundary-support-mcp',           label: 'Boundary Docs',          matches: /\bboundary\b/i },
    { name: 'terraform-support-mcp',          label: 'Terraform Docs',         matches: /\bterraform\b|\btfstate\b|\bprovider\b/i },
    { name: 'consul-support-mcp',             label: 'Consul Docs',            matches: /\bconsul\b/i },
    { name: 'kubernetes-support-mcp',         label: 'Kubernetes Docs',        matches: /\bkubernetes\b|\bk8s\b|\bhelm\b|\bkubectl\b|\bcert-manager\b|\bvault-k8s\b/i },
    { name: 'aws-support-mcp',                label: 'AWS Docs',               matches: /\baws\b|\beks\b|\beirsa\b/i },
    { name: 'azure-support-mcp',              label: 'Azure Docs',             matches: /\bazure\b|\baks\b|\bentra\b/i },
    { name: 'gcp-support-mcp',                label: 'GCP Docs',               matches: /\bgcp\b|\bgke\b|\bgoogle\s+cloud\b/i },
    { name: 'redhat-support-mcp',             label: 'OpenShift Docs',         matches: /\bopenshift\b|\bred\s*hat\b|\bocp\b/i },
    { name: 'microsoft-support-mcp',          label: 'Windows / AD Docs',      matches: /\bactive\s+directory\b|\bwindows\s+server\b|\bentra\s+id\b|\badfs\b/i },
    { name: 'pki-support-mcp',                label: 'PKI / TLS Docs',         matches: /\bpki\b|\btls\b|\bcertificate\b|\bacme\b|\bspiffe\b|\bspire\b/i },
    { name: 'networking-support-mcp',         label: 'Networking Docs',        matches: /\benvoy\b|\bistio\b|\bcoredns\b|\bnginx\b|\bhaproxy\b/i },
    { name: 'ldap-ad-support-mcp',            label: 'LDAP / AD Docs',         matches: /\bldap\b|\bfreeipa\b|\bsamba\b|\bsssd\b/i },
    { name: 'secrets-management-support-mcp', label: 'Secrets Mgmt Docs',      matches: /\bexternal\s+secrets\b|\beso\b|\bsops\b|\bsealed\s+secrets\b|\bdoppler\b/i },
    { name: 'observability-support-mcp',      label: 'Observability Docs',     matches: /\bprometheus\b|\bgrafana\b|\bopentelemetry\b|\bloki\b|\bdatadog\b/i },
    { name: 'golang-support-mcp',             label: 'Go Docs',                matches: /\bgolang\b|\bgo\s+module\b|\bgrpc\b|\braft\b|\bhcl\b/i },
    { name: 'mcp-atlassian',                  label: 'Jira & Confluence',      matches: /\b(jira|confluence|atlassian)\b/i },
  ].filter(item => item.matches.test(text) && mcps.some(mcp => mcp.name === item.name) && !effectiveMcps.includes(item.name) && !dismissedSuggestions.includes(item.name));

  // Slash-command picker state
  const [slashQuery,   setSlashQuery]   = useState('');
  const [showPicker,   setShowPicker]   = useState(false);
  const [pickerIndex,  setPickerIndex]  = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  // ── Apply preset skill from right panel ──────────────────────────────────
  useEffect(() => {
    if (presetSkill) {
      setActiveSkill(presetSkill);
      onPresetSkillUsed?.();
      textareaRef.current?.focus();
    }
  }, [presetSkill, onPresetSkillUsed]);

  // ── Auto-resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  // ── Filtered skills for slash picker ─────────────────────────────────────
  const pickerItems: Skill[] = slashQuery
    ? skills.filter(s => s.name.toLowerCase().includes(slashQuery.toLowerCase()))
    : skills;

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    const msg = text.trim();
    if (!msg || loading || preparing) return;
    setPreparing(true);
    setAttachmentError('');
    try {
      const accepted = await onSubmit({ message: msg, mode: currentMode, skill: activeSkill || undefined, mcps: effectiveMcps, files: attachments, automaticActions });
      if (accepted) { setText(''); setActiveSkill(''); setAttachments([]); setAutomaticActions(false); }
    } catch (error) { setAttachmentError(error instanceof Error ? error.message : 'Could not send the attachments. Please try again.'); }
    finally { setPreparing(false); }
  }, [text, loading, preparing, currentMode, activeSkill, effectiveMcps, attachments, automaticActions, onSubmit]);

  // ── Keyboard handling ─────────────────────────────────────────────────────
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPickerIndex(i => Math.min(i + 1, pickerItems.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setPickerIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = pickerItems[pickerIndex];
        if (chosen) selectSkill(chosen.name);
        return;
      }
      if (e.key === 'Escape') { setShowPicker(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  // ── Text change — detect "/" at start ────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Show picker when user types "/" at start of input or after whitespace
    const match = val.match(/(?:^|\s)\/(\S*)$/);
    if (match) {
      setSlashQuery(match[1]);
      setPickerIndex(0);
      setShowPicker(true);
    } else {
      setShowPicker(false);
    }
  };

  const selectSkill = (name: string) => {
    // Remove the trailing /query from the textarea
    setText(prev => prev.replace(/(?:^|\s)\/\S*$/, '').trimStart());
    setActiveSkill(name);
    setShowPicker(false);
    textareaRef.current?.focus();
  };

  const canSend = text.trim().length > 0 && !loading && !preparing;

  const addAttachments = (files: FileList | null) => {
    if (!files || loading || preparing) return;
    // Copy the selection before the input is reset, otherwise the browser
    // clears the live FileList before React applies the state update.
    const pickedFiles = Array.from(files);
    const next = [...attachments];
    const errors: string[] = [];
      for (const file of pickedFiles) {
        const alreadyAdded = next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
        if (alreadyAdded) continue;
        if (!/\.(txt|log|md|markdown|tf|tfvars|hcl|json|ya?ml|go|sh|ps1|py|jsx?|tsx?|csv|xml|html|css|sql|conf|ini|toml|properties)$/i.test(file.name)) errors.push(`${file.name}: only text, code and logs are supported.`);
        else if (file.size > 15 * 1024 * 1024) errors.push(`${file.name}: exceeds 15 MB.`);
        else if (next.length >= 4) errors.push(`${file.name}: only 4 files per message.`);
        else next.push(file);
      }
    setAttachments(next);
    setAttachmentError(errors.join(' '));
    setShowAttachments(false);
  };

  return (
    <div style={{ padding: '0 0 16px', position: 'relative' }}>

      {/* ── Slash-command picker ── */}
      {showPicker && pickerItems.length > 0 && (
        <div
          ref={pickerRef}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0, right: 0,
            background: 'var(--surface3)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            overflow: 'hidden',
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            Skills — type to filter
          </div>
          {pickerItems.map((s, i) => (
            <div
              key={s.name}
              onClick={() => selectSkill(s.name)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                background: i === pickerIndex ? 'var(--surface2)' : 'transparent',
                borderLeft: `2px solid ${i === pickerIndex ? 'var(--accent)' : 'transparent'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
              onMouseEnter={() => setPickerIndex(i)}
            >
              <span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontWeight: 600, color: i === pickerIndex ? 'var(--text)' : 'var(--text2)' }}>
                /{s.name}
              </span>
              {s.description && (
                <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)', lineHeight: 1.4 }}>
                  {s.description.slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Input card ── */}
      <button className="composer-context-summary" onClick={() => setShowSetup(open => !open)} aria-expanded={showSetup}>
        <SlidersHorizontal size={13} />{effectiveMcps.length ? `${profile?.label || 'Custom tools'} · ${effectiveMcps.length} selected tools` : 'No MCPs enabled · Add tools when needed'}
        <span>{automaticActions ? 'Automatic actions' : 'Standard permissions'}</span>
      </button>
      <div style={{
        background: 'var(--surface2)',
        border: `1px solid ${activeSkill ? 'var(--accent-d)' : 'var(--border2)'}`,
        borderRadius: 'var(--radius)',
        // The attachment menu deliberately extends above the card.
        // Keeping this visible prevents the menu from being cut off.
        overflow: 'visible',
        transition: 'border-color 0.15s',
      }}>
        {modelControls}
        {toolSuggestions.length > 0 && <div className="mcp-suggestions">
          <span>Suggested for your message</span>
          {toolSuggestions.map(item => <span key={item.name} className="mcp-suggestion">
            <button disabled={loading || preparing} onClick={() => setSelectedMcps(current => [...new Set([...current, item.name])])}>Enable {item.label}</button>
            <button disabled={loading || preparing} aria-label={`Dismiss ${item.label} suggestion`} onClick={() => setDismissedSuggestions(current => [...current, item.name])}><X size={12} /></button>
          </span>)}
          <small>Optional · tools are enabled only when you click.</small>
        </div>}
        {effectiveMcps.length > 0 && <div className="mcp-suggestions" aria-label="Enabled MCPs">
          {effectiveMcps.map(name => <button className="mcp-enabled" key={name} disabled={loading || preparing} title={`Remove ${name}`} onClick={() => {
            setSelectedMcps(effectiveMcps.filter(item => item !== name));
            onProfileChange('custom');
            setDismissedSuggestions(current => [...current, name]);
          }}>{name}<X size={12} /></button>)}
        </div>}
        <input ref={fileInputRef} type="file" multiple onChange={event => { addAttachments(event.target.files); event.target.value = ''; }} style={{ display: 'none' }} />
        <input ref={folderInputRef} type="file" multiple onChange={event => { addAttachments(event.target.files); event.target.value = ''; }} style={{ display: 'none' }} />

        {/* Active skill badge */}
        {activeSkill && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--accent-soft)',
          }}>
            <span style={{ fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Skill</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-d)',
              color: 'var(--accent)',
            }}>
              /{activeSkill}
              <button
                onClick={() => setActiveSkill('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 0, lineHeight: 1 }}
              >
                <X size={11} />
              </button>
            </span>
            <span style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--muted)' }}>Instructions will be injected automatically</span>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {attachmentError && <div role="alert" style={{ padding: '10px 12px', color: 'var(--red)', fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>{attachmentError}</div>}
          {preparing && <div role="status" style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>Preparing message and uploading files…</div>}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '9px 12px 0' }}>
              <span style={{ alignSelf: 'center', fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Selected · {attachments.length}/4</span>
              {attachments.map(file => (
                <button disabled={loading || preparing} key={`${file.name}-${file.lastModified}`} onClick={() => setAttachments(current => current.filter(item => item !== file))} title="Remove" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 210, padding: '3px 7px', border: '1px solid var(--border2)', borderRadius: 999, background: 'var(--surface3)', color: 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', cursor: 'pointer' }}>
                  <File size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span><X size={11} />
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder={activeSkill ? `Ask using /${activeSkill}…` : 'Ask Bob anything… or type / to use a skill'}
            rows={3}
            disabled={loading}
            style={{
              display: 'block', width: '100%',
              background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              padding: '14px 58px 10px 16px',
              fontSize: 'calc(var(--base-font-size) * 14 / 14)', color: 'var(--text)', lineHeight: 1.6,
              minHeight: 80, maxHeight: 200,
              fontFamily: 'inherit',
            }}
          />
          <button onClick={loading ? onStop : submit} disabled={!loading && !canSend} aria-label={loading ? 'Stop generating' : 'Send message'} title={loading ? 'Stop generating' : 'Send message'} style={{ position: 'absolute', right: 12, bottom: 10, width: 32, height: 32, borderRadius: '50%', border: 'none', display: 'grid', placeItems: 'center', cursor: (!loading && !canSend) ? 'not-allowed' : 'pointer', background: loading ? 'var(--red)' : canSend ? 'var(--accent)' : 'var(--surface3)', color: loading || canSend ? '#fff' : 'var(--muted)' }}>
            {loading ? <Square size={12} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
          </button>
          <button onClick={() => setShowSetup(open => !open)} aria-label={showSetup ? 'Hide controls' : 'Show controls'} title={showSetup ? 'Hide controls' : 'Show controls'} style={{ position: 'absolute', right: 50, bottom: 10, width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', cursor: 'pointer', background: showSetup ? 'var(--surface3)' : 'transparent', color: 'var(--text2)' }}>
            <SlidersHorizontal size={14} />
          </button>
          <button onClick={() => setShowAttachments(open => !open)} aria-label="Attachment options" title="Add files or folders" style={{ position: 'absolute', left: 12, bottom: 10, width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', cursor: 'pointer', background: showAttachments ? 'var(--surface3)' : 'transparent', color: 'var(--text2)' }}>
            <Plus size={17} />
          </button>
          {showAttachments && (
            <div style={{ position: 'absolute', left: 12, bottom: 48, width: 210, padding: 6, border: '1px solid var(--border2)', borderRadius: 10, background: 'var(--elevated)', boxShadow: 'var(--shadow)', zIndex: 20 }}>
              <div style={{ padding: '5px 7px 7px', fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Files and folders</div>
              <button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 7px', border: 'none', borderRadius: 6, textAlign: 'left', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}><File size={14} /><span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>Files</span></button>
              <button onClick={() => folderInputRef.current?.click()} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 7px', border: 'none', borderRadius: 6, textAlign: 'left', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}><Folder size={14} /><span style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>Folder</span></button>
              <div style={{ marginTop: 4, padding: '7px', borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'calc(var(--base-font-size) * 11 / 14)' }}>Text, code and logs · Up to 4 files · 15 MB each</div>
            </div>
          )}
        </div>

        {showSetup && <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={automaticActions} disabled={loading || preparing} onChange={event => setAutomaticActions(event.target.checked)} />Allow automatic actions for this message</label>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>Off: uses Bob’s configured permissions; additional approvals must be handled in Bob Shell. On: Bob may edit files, run commands and use selected services without asking again. This is not a sandbox.</p>
        </div>}
        {automaticActions && !showSetup && <div role="status" style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 'calc(var(--base-font-size) * 12 / 14)' }}>Automatic actions enabled for the next message · <button onClick={() => setAutomaticActions(false)}>Turn off</button></div>}
        {showSetup && selectedProfileId !== 'custom' && showProfileTools && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Enabled for {profile?.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {effectiveMcps.map(name => (
                <span key={name} style={{ padding: '3px 6px', borderRadius: 999, background: selectedMcps.includes(name) ? 'var(--green-soft)' : 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', color: selectedMcps.includes(name) ? 'var(--green)' : 'var(--accent)', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', fontFamily: 'var(--mono)' }}>{name}{selectedMcps.includes(name) ? ' · extra' : ''}</span>
              ))}
            </div>
          </div>
        )}

        {/* Bottom bar */}
        {showSetup && <div style={{
          display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
          padding: '8px 12px 12px',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Mode */}
          <select aria-label="Support profile" value={selectedProfileId} onChange={e => onProfileChange(e.target.value)} style={{ width: 138, background: 'var(--accent-soft)', border: '1px solid var(--accent-d)', borderRadius: 5, color: 'var(--accent)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', padding: '5px 7px', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', fontWeight: 600 }}>
            {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
          </select>
          <select
            value={currentMode}
            onChange={e => onModeChange(e.target.value)}
            style={{
              width: 106, background: 'var(--surface3)', border: '1px solid var(--border)',
              borderRadius: 5, color: 'var(--text2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)',
              padding: '5px 7px', cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
            }}
          >
            {modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>

          {/* MCP */}
          {selectedProfileId !== 'custom' && (
            <button onClick={() => setShowProfileTools(open => !open)} title={profile?.description} style={{ fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)', padding: '5px 8px', borderRadius: 5, background: 'var(--surface3)', border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Tools · {profile?.mcps.length ?? 0}{selectedMcps.length ? ` +${selectedMcps.length}` : ''} {showProfileTools ? '▴' : '▾'}</button>
          )}
          {mcps.length > 0 && (
            <select
              value=""
              onChange={e => {
                const name = e.target.value;
                if (!name) return;
                setSelectedMcps(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
                setShowProfileTools(false);
              }}
              style={{
                background: 'var(--surface3)',
                border: `1px solid ${selectedMcps.length ? 'var(--accent-d)' : 'var(--border)'}`,
                borderRadius: 5,
                color: selectedMcps.length ? 'var(--accent)' : 'var(--muted)',
                width: 146, fontSize: 'calc(var(--base-font-size) * 11 / 14)', padding: '5px 7px', cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
              }}
            >
              <option value="">{selectedProfileId === 'custom' ? 'MCP…' : 'Add MCP…'}</option>
              {selectableMcps.map(m => (
                <option key={m.name} value={m.name}>{selectedMcps.includes(m.name) ? '✓ ' : ''}{m.name}</option>
              ))}
            </select>
          )}

          <div style={{ flex: 1, minWidth: 4 }} />
        </div>}

        {showSetup && selectedMcps.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, padding: '0 12px 10px', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span style={{ fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)', marginRight: 2 }}>Added MCPs</span>
            {selectedMcps.map(name => (
              <button key={name} onClick={() => setSelectedMcps(current => current.filter(item => item !== name))} title="Remove MCP" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 999, border: '1px solid var(--green)', background: 'var(--green-soft)', color: 'var(--green)', fontSize: 'calc(var(--base-font-size) * 10.5 / 14)', fontFamily: 'var(--mono)', cursor: 'pointer' }}>
                {name} <X size={11} />
              </button>
            ))}
          </div>
        )}

        {/* Keyboard help only appears while the configuration panel is open. */}
        {showSetup && <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          padding: '8px 14px 10px',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--muted)' }}>
            Press{' '}
            <kbd style={{ padding: '2px 5px', borderRadius: 4, background: 'var(--surface3)', border: '1px solid var(--border2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)', fontFamily: 'inherit' }}>Enter</kbd>
            {' '}to send ·{' '}
            <kbd style={{ padding: '2px 5px', borderRadius: 4, background: 'var(--surface3)', border: '1px solid var(--border2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)', fontFamily: 'inherit' }}>Shift+Enter</kbd>
            {' '}for newline ·{' '}
            <kbd style={{ padding: '2px 5px', borderRadius: 4, background: 'var(--surface3)', border: '1px solid var(--border2)', fontSize: 'calc(var(--base-font-size) * 11 / 14)', color: 'var(--text2)', fontFamily: 'inherit' }}>/</kbd>
            {' '}for skills
          </div>
        </div>}
      </div>
    </div>
  );
};
