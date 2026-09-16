import { type FC, useState } from 'react';
import { Blocks, ChevronDown, Cloud, ExternalLink, Flame, FlaskConical, FolderOpen, FolderPlus, KeyRound, Mail, PanelLeftClose, Plus, Workflow, X, type LucideIcon } from 'lucide-react';
import type { Session, Workspace } from '../types';
import { REPRODUCTION_TOOLS } from '../config/reproductionTools';

interface Props {
  sessions:        Session[];
  activeSessionId: string | null;
  activeNav:       'chat' | 'insights' | 'gtm';
  workspaces:      Workspace[];
  activeWorkspaceId: string;
  onWorkspaceChange: (id: string) => void;
  onCreateWorkspace: (name: string, projectPath?: string) => Promise<void>;
  onNavChange:     (n: 'chat' | 'insights' | 'gtm') => void;
  onSelect:        (id: string) => void;
  onNew:           () => void;
  onDelete:        (id: string) => void;
  onCollapse:      () => void;
}

const LIGHTNING_SUPPORT = 'https://ibmsf.lightning.force.com/lightning/o/Case/list?filterName=My_Open_Cases21662';
const CONFLUENCE = 'https://hashicorp.atlassian.net/wiki/spaces/SSE1/overview?homepageId=2813330104';
const IBM_SUPPORT_KB = 'https://www.ibm.com/mysupport/s/?language=en_US';

const REPRODUCTION_ICONS: Record<string, LucideIcon> = {
  fyre: Flame,
  doormat: KeyRound,
  vett: Workflow,
  croks: Blocks,
  enos: Cloud,
};

export const Sidebar: FC<Props> = ({
  sessions, activeSessionId, workspaces, activeWorkspaceId, onWorkspaceChange, onCreateWorkspace, onSelect, onNew, onDelete, onCollapse,
}) => {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [existingProject, setExistingProject] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [reproductionOpen, setReproductionOpen] = useState(false);
  const [workspaceFormOpen, setWorkspaceFormOpen] = useState(false);

  const submitWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name || creatingWorkspace || (existingProject && !projectPath.trim())) return;
    setCreatingWorkspace(true);
    setWorkspaceError('');
    try {
      await onCreateWorkspace(name, existingProject ? projectPath.trim() : undefined);
      setNewWorkspaceName('');
      setProjectPath('');
      setExistingProject(false);
      setWorkspaceFormOpen(false);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not create workspace');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  return (
    <aside className="sidebar-rail" style={{
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'color-mix(in srgb, var(--sidebar-tint, var(--accent)) 10%, var(--surface))',
      borderRight: '1px solid var(--border)',
    }}>
      <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px 6px' }}>
          <span style={{ fontSize: 'calc(var(--base-font-size) * 9.5 / 14)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Workspace</span>
          <div style={{ flex: 1 }} />
          <button className="icon-button" onClick={() => setWorkspaceFormOpen(open => !open)} aria-label="New workspace" title="New workspace" aria-expanded={workspaceFormOpen}><FolderPlus size={16} /></button>
          <button className="icon-button" onClick={onCollapse} aria-label="Collapse navigation" title="Collapse navigation">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <select
          value={activeWorkspaceId}
          onChange={event => onWorkspaceChange(event.target.value)}
          aria-label="Select workspace"
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', padding: '7px 8px', fontSize: 'calc(var(--base-font-size) * 12 / 14)', fontFamily: 'inherit' }}
        >
          {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
        {workspaceFormOpen && <><div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
          <input
            value={newWorkspaceName}
            onChange={event => setNewWorkspaceName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void submitWorkspace(); }}
            placeholder="New workspace name"
            aria-label="New workspace name"
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 'calc(var(--base-font-size) * 11 / 14)', fontFamily: 'inherit' }}
          />
          <button className="icon-button" onClick={() => void submitWorkspace()} disabled={!newWorkspaceName.trim() || creatingWorkspace || (existingProject && !projectPath.trim())} aria-label="Create workspace" title="Create workspace" style={{ width: 30, height: 30, flex: '0 0 30px' }}>
            <FolderPlus size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setExistingProject(current => !current)}
          aria-expanded={existingProject}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: 0, border: 0, background: 'transparent', color: existingProject ? 'var(--accent)' : 'var(--muted)', font: 'inherit', fontSize: 'calc(var(--base-font-size) * 9.5 / 14)', cursor: 'pointer' }}
        >
          <FolderOpen size={12} /> {existingProject ? 'Use a new managed workspace' : 'Use an existing project or team repo'}
        </button>
        {existingProject && (
          <input
            value={projectPath}
            onChange={event => setProjectPath(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void submitWorkspace(); }}
            placeholder="Absolute project path"
            aria-label="Existing project path"
            style={{ width: '100%', marginTop: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontFamily: 'var(--mono)' }}
          />
        )}
        {workspaceError && <div style={{ marginTop: 5, color: 'var(--red)', fontSize: 'calc(var(--base-font-size) * 10 / 14)' }}>{workspaceError}</div>}
        </>}
      </div>

      {/* Internal resources */}
      <details className="sidebar-resources">
        <summary>Resources &amp; tools <ChevronDown size={15} /></summary>
        <div className="sidebar-resources-content">
          <div className="sidebar-product-docs">
            <a href="https://developer.hashicorp.com/vault" target="_blank" rel="noreferrer" aria-label="Vault documentation" title="Vault documentation"><img src="/vault-logo.svg" alt="Vault" /></a>
            <a href="https://developer.hashicorp.com/boundary" target="_blank" rel="noreferrer" aria-label="Boundary documentation" title="Boundary documentation"><img src="/boundary-logo.svg" alt="Boundary" /></a>
          </div>
      <div style={{ padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
        <a className="resource-link brand-resource resource-salesforce" href={LIGHTNING_SUPPORT} target="_blank" rel="noreferrer">
          <span className="brand-logo-tile">
            <img src="https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg" alt="Salesforce" />
          </span>
          <span className="brand-copy">
            <strong>Lightning Support</strong>
            <small>My open Salesforce cases</small>
          </span>
          <ExternalLink size={13} />
        </a>
        <a className="resource-link brand-resource resource-confluence" href={CONFLUENCE} target="_blank" rel="noreferrer">
          <span className="brand-logo-tile">
            <img src="https://cdn.simpleicons.org/confluence/1868DB" alt="Confluence" />
          </span>
          <span className="brand-copy">
            <strong>Confluence</strong>
            <small>SSE knowledge space</small>
          </span>
          <ExternalLink size={13} />
        </a>
        <a className="resource-link brand-resource resource-ibm" href={IBM_SUPPORT_KB} target="_blank" rel="noreferrer">
          <span className="brand-logo-tile">
            <img src="/ibm-bee.svg" alt="IBM Bee" style={{ width: 24, height: 24, filter: 'invert(1)' }} />
          </span>
          <span className="brand-copy">
            <strong>IBM Support Knowledge Base</strong>
            <small>Search support articles and guidance</small>
          </span>
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Reproduction toolkit */}
      <section className={`reproduction-toolkit${reproductionOpen ? ' is-open' : ''}`}>
        <button
          className="reproduction-trigger"
          onClick={() => setReproductionOpen(current => !current)}
          aria-expanded={reproductionOpen}
          aria-controls="reproduction-tool-list"
        >
          <span className="reproduction-trigger-icon"><FlaskConical size={14} /></span>
          <span><strong>Reproduction Toolkit</strong><small>{REPRODUCTION_TOOLS.length} environments &amp; tools</small></span>
          <ChevronDown size={14} />
        </button>
        {reproductionOpen && (
          <div id="reproduction-tool-list" className="reproduction-tool-list">
            {REPRODUCTION_TOOLS.map(tool => (
              <article className="reproduction-tool" key={tool.id}>
                <div className="reproduction-tool-heading">
                  <span className="reproduction-tool-icon" data-tool={tool.id}>
                    {(() => { const Icon = REPRODUCTION_ICONS[tool.id] || FlaskConical; return <Icon size={14} />; })()}
                  </span>
                  <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                </div>
                <div className="reproduction-actions">
                  {tool.links.map(link => (
                    <a key={`${tool.id}-${link.label}`} href={link.url} target="_blank" rel="noreferrer" title={`Open ${link.label}`}>
                      {link.label}
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
        </div>
      </details>

      {/* New thread */}
      <div style={{ padding: '4px 10px 12px', flexShrink: 0 }}>
          <button className="primary-action"
          onClick={onNew}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 'calc(var(--base-font-size) * 13 / 14)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={14} />
          New thread
        </button>
      </div>

      {/* Threads list */}
      <div style={{ flex: 1, minHeight: 100, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
        {sessions.length > 0 && (
          <div style={{ padding: '10px 16px 4px', fontSize: 'calc(var(--base-font-size) * 10 / 14)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Recents
          </div>
        )}
        {sessions.map(s => (
          <ThreadRow
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            hovered={hoverId === s.id}
            onHover={setHoverId}
            onSelect={() => onSelect(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--muted)' }}>
            No threads yet
          </div>
        )}
      </div>

      {/* Bottom utility buttons */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)' }}>
        <span style={{ padding: '0 4px', fontSize: 'calc(var(--base-font-size) * 9.5 / 14)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Support</span>
        <a className="resource-link" href="https://bob.ibm.com/docs/ide" target="_blank" rel="noreferrer" style={{ justifyContent: 'space-between', padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>
          <span>About Bob</span><ExternalLink size={12} />
        </a>
        <a className="resource-link" href="mailto:zaid.baban@ibm.com" style={{ justifyContent: 'space-between', padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>
          <span>Submit feedback</span><Mail size={12} />
        </a>
        <div style={{ alignSelf: 'center', marginTop: 2, padding: '3px 7px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 'calc(var(--base-font-size) * 9.5 / 14)', color: 'var(--muted)' }}>Prototype · v0.1.0</div>
      </div>
    </aside>
  );
};

const ThreadRow: FC<{
  session: Session;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ session, active, hovered, onHover, onSelect, onDelete }) => (
  <div
    className="thread-row"
    onMouseEnter={() => onHover(session.id)}
    onMouseLeave={() => onHover(null)}
    style={{
      position: 'relative',
      padding: '8px 16px',
      cursor: 'pointer',
      background: active ? 'var(--surface2)' : hovered ? 'var(--surface3)' : 'transparent',
      borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    }}
  >
    <button className="thread-select" onClick={onSelect} aria-current={active ? 'page' : undefined}>
    <div style={{
      fontSize: 'calc(var(--base-font-size) * 14 / 14)',
      color: active ? 'var(--text)' : 'var(--text2)',
      fontWeight: active ? 500 : 400,
      lineHeight: 1.45,
      paddingRight: 20,
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical' as const,
    }}>
      {session.title || 'Untitled'}
    </div>
    {session.updated && (
      <div style={{ fontSize: 'calc(var(--base-font-size) * 12 / 14)', color: 'var(--muted)', marginTop: 2 }}>
        {formatDate(session.updated)}
      </div>
    )}
    </button>
      <button
        className="thread-delete"
        aria-label={`Delete conversation: ${session.title || 'Untitled'}`}
        onClick={e => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', top: 8, right: 10,
          width: 18, height: 18,
          border: 'none', background: 'transparent',
          color: 'var(--muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 3,
        }}
      >
        <X size={11} />
      </button>
  </div>
);

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
