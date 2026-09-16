import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Check, Code2, Copy, Download, ExternalLink, Eye, FileCode2, Image as ImageIcon, PanelRightClose, Paperclip, Settings2, WrapText, X } from 'lucide-react';
import type { ConfluencePage, SourceFile } from '../types';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

interface Props {
  files: SourceFile[];
  activeFilePath: string;
  loading: boolean;
  error: string;
  confluencePage: ConfluencePage | null;
  resourceLoading: boolean;
  resourceError: string;
  resourceUrl: string;
  activeTab: 'file' | 'resource';
  onActiveTabChange: (tab: 'file' | 'resource') => void;
  onOpenMcpConfig: () => void;
  onActiveFileChange: (path: string) => void;
  onCloseFile: (path: string) => void;
  onCloseResource: () => void;
  onOpenResource: (url: string) => void;
  onCollapse: () => void;
  width: number;
  onWidthChange: (width: number) => void;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  css: 'css', go: 'go', html: 'xml',
  java: 'java', js: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown',
  py: 'python', sh: 'bash', ts: 'typescript',
  tsx: 'typescript', yaml: 'yaml', yml: 'yaml', xml: 'xml',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

function clampPanelWidth(width: number): number {
  const maximum = Math.min(760, Math.floor(window.innerWidth * 0.68));
  return Math.max(300, Math.min(maximum, width));
}

function formatConfluenceMarkdown(content: string): string {
  const lines = content.split('\n');
  const formatted: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\$\s+/.test(lines[index])) {
      formatted.push(lines[index]);
      continue;
    }
    const block: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      // Markdown escaping is useful in prose but should not appear in a shell block.
      block.push(lines[index].replace(/\\([_*<>])/g, '$1'));
      index += 1;
    }
    formatted.push('```bash', ...block, '```', '');
  }
  return formatted.join('\n');
}

function attachmentUrl(id: string, title: string, download = false): string {
  const query = new URLSearchParams({ name: title });
  if (download) query.set('download', '1');
  return `/api/atlassian/confluence/attachments/${encodeURIComponent(id)}?${query}`;
}

function isImageAttachment(mediaType: string | undefined, title: string): boolean {
  return mediaType?.startsWith('image/') === true || /\.(?:png|jpe?g|gif|webp|svg)$/i.test(title);
}

export const RightPanel: FC<Props> = ({
  files, activeFilePath, loading, error, confluencePage, resourceLoading, resourceError, resourceUrl,
  activeTab, onActiveTabChange, onActiveFileChange, onOpenMcpConfig, onCloseFile, onCloseResource, onOpenResource, onCollapse,
  width, onWidthChange,
}) => {
  const file = files.find(item => item.path === activeFilePath) || files.at(-1) || null;
  const [copied, setCopied] = useState(false);
  const [expandedAttachment, setExpandedAttachment] = useState<{ id: string; title: string } | null>(null);
  const [wrapLines, setWrapLines] = useState(() => window.localStorage.getItem('bob-code-wrap') !== 'false');
  const [markdownPreview, setMarkdownPreview] = useState(true);
  const panelWidth = clampPanelWidth(width);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const isMarkdown = file?.extension === 'md' || file?.extension === 'markdown';
  const isHtml = file?.extension === 'html' || file?.extension === 'htm';
  const [htmlPreview, setHtmlPreview] = useState(true);
  const confluenceMarkdown = useMemo(
    () => formatConfluenceMarkdown(confluencePage?.content || ''),
    [confluencePage?.content],
  );

  useEffect(() => () => { document.body.style.userSelect = ''; }, []);
  useEffect(() => { setMarkdownPreview(true); setHtmlPreview(true); }, [file?.path]);
  useEffect(() => {
    if (!expandedAttachment) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpandedAttachment(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedAttachment]);
  useEffect(() => { setExpandedAttachment(null); }, [confluencePage?.id]);

  const resizeTo = (width: number) => {
    const nextWidth = clampPanelWidth(width);
    onWidthChange(nextWidth);
  };
  const highlighted = useMemo(() => {
    if (!file) return '';
    const language = LANGUAGE_BY_EXTENSION[file.extension];
    if (language && hljs.getLanguage(language)) return hljs.highlight(file.content, { language }).value;
    return hljs.highlightAuto(file.content).value;
  }, [file]);

  const copyCode = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const toggleWrap = () => {
    setWrapLines(current => {
      window.localStorage.setItem('bob-code-wrap', String(!current));
      return !current;
    });
  };

  return (
    <aside className="right-rail code-viewer" style={{
      width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', position: 'relative',
      height: '100%', background: 'color-mix(in srgb, var(--sidebar-tint, var(--accent)) 5%, var(--surface))', borderLeft: '1px solid var(--border)',
    }}>
      <div
        className="code-viewer-resizer"
        role="separator"
        aria-label="Resize code viewer"
        aria-orientation="vertical"
        aria-valuemin={300}
        aria-valuemax={Math.min(760, Math.floor(window.innerWidth * 0.68))}
        aria-valuenow={panelWidth}
        tabIndex={0}
        title="Drag to resize · Double-click to reset"
        onDoubleClick={() => resizeTo(420)}
        onPointerDown={event => {
          dragRef.current = { startX: event.clientX, startWidth: panelWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
          document.body.style.userSelect = 'none';
        }}
        onPointerMove={event => {
          if (!dragRef.current) return;
          resizeTo(dragRef.current.startWidth + dragRef.current.startX - event.clientX);
        }}
        onPointerUp={event => {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          document.body.style.userSelect = '';
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          document.body.style.userSelect = '';
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); resizeTo(panelWidth + 24); }
          if (event.key === 'ArrowRight') { event.preventDefault(); resizeTo(panelWidth - 24); }
          if (event.key === 'Home') { event.preventDefault(); resizeTo(300); }
          if (event.key === 'End') { event.preventDefault(); resizeTo(760); }
        }}
      ><span /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 13px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Code2 size={16} color="var(--accent)" />
        <span style={{ fontSize: 'calc(var(--base-font-size) * 13 / 14)', fontWeight: 650, color: 'var(--text)' }}>Viewer</span>
        <div style={{ flex: 1 }} />
        <button className="icon-button" onClick={onOpenMcpConfig} aria-label="Open sanitized MCP configuration" title="Open sanitized MCP configuration"><Settings2 size={15} /></button>
        <button className="icon-button" onClick={onCollapse} aria-label="Collapse code viewer" title="Collapse code viewer"><PanelRightClose size={16} /></button>
      </div>

      {(files.length > 0 || loading || resourceUrl) && (
        <div className="viewer-tabs" role="tablist" aria-label="Open viewer tabs">
          {files.map(openFile => (
            <button key={openFile.path} className={`viewer-tab${activeTab === 'file' && file?.path === openFile.path ? ' is-active' : ''}`} onClick={() => { onActiveTabChange('file'); onActiveFileChange(openFile.path); }} role="tab" aria-selected={activeTab === 'file' && file?.path === openFile.path}>
              <FileCode2 size={13} /><span>{openFile.name}</span>
              <span className="viewer-tab-close" role="button" aria-label={`Close ${openFile.name}`} onClick={event => { event.stopPropagation(); onCloseFile(openFile.path); }}><X size={12} /></span>
            </button>
          ))}
          {loading && files.length === 0 && <span className="viewer-tab is-active"><FileCode2 size={13} /><span>Opening file…</span></span>}
          {resourceUrl && (
            <button className={`viewer-tab${activeTab === 'resource' ? ' is-active' : ''}`} onClick={() => onActiveTabChange('resource')} role="tab" aria-selected={activeTab === 'resource'}>
              <span className="confluence-mark">C</span><span>{confluencePage?.title || 'Confluence'}</span>
              <span className="viewer-tab-close" role="button" aria-label="Close Confluence page" onClick={event => { event.stopPropagation(); onCloseResource(); }}><X size={12} /></span>
            </button>
          )}
        </div>
      )}

      {activeTab === 'resource' && resourceUrl ? (
        resourceLoading ? (
          <div className="code-viewer-empty"><span className="code-viewer-loader" /><span>Opening Confluence page…</span></div>
        ) : resourceError ? (
          <div className="code-viewer-empty"><strong>Couldn’t open this Confluence page</strong><span>{resourceError}</span><a className="resource-open-original" href={resourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open original</a></div>
        ) : confluencePage ? (
          <div className="confluence-preview">
            <div className="confluence-toolbar">
              <div className="confluence-title-block">
                <div className="confluence-eyebrow">{confluencePage.space?.name || 'Confluence'}</div>
                <h2>{confluencePage.title}</h2>
                <div className="confluence-meta">
                  {confluencePage.author && <span>{confluencePage.author}</span>}
                  {confluencePage.updated && <span>Updated {new Date(confluencePage.updated).toLocaleDateString()}</span>}
                  {confluencePage.version && <span>v{confluencePage.version}</span>}
                </div>
              </div>
              <a className="resource-open-original" href={confluencePage.url || resourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open original</a>
            </div>
            <div className="confluence-content prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a: ({ href, children }) => {
                    const resolved = href?.startsWith('/') ? `https://hashicorp.atlassian.net${href}` : href;
                    return <a href={resolved} target="_blank" rel="noreferrer" onClick={event => {
                      if (!resolved?.includes('atlassian.net/wiki')) return;
                      event.preventDefault();
                      onOpenResource(resolved);
                    }}>{children}</a>;
                  },
                }}
              >{confluenceMarkdown}</ReactMarkdown>
              {confluencePage.attachments.length > 0 && (
                <details className="confluence-attachments" open={confluencePage.attachments.length <= 4}>
                  <summary><Paperclip size={13} /> {confluencePage.attachments.length} attachment{confluencePage.attachments.length === 1 ? '' : 's'}</summary>
                  <div className="confluence-attachment-grid">
                    {confluencePage.attachments.map(attachment => {
                      const image = isImageAttachment(attachment.media_type, attachment.title);
                      const inlineUrl = attachmentUrl(attachment.id, attachment.title);
                      return image ? (
                        <button className="confluence-image-card" key={attachment.id} type="button" onClick={() => setExpandedAttachment({ id: attachment.id, title: attachment.title })} title={`Expand ${attachment.title}`}>
                          <img src={inlineUrl} alt={attachment.title} loading="lazy" />
                          <span><ImageIcon size={12} /> <span>{attachment.title}</span>{typeof attachment.file_size === 'number' && <small>{formatBytes(attachment.file_size)}</small>}</span>
                        </button>
                      ) : (
                        <a className="confluence-file-card" key={attachment.id} href={attachmentUrl(attachment.id, attachment.title, true)}>
                          <span className="confluence-file-icon"><FileCode2 size={17} /></span>
                          <span><strong>{attachment.title}</strong>{typeof attachment.file_size === 'number' && <small>{formatBytes(attachment.file_size)}</small>}</span>
                          <Download size={14} />
                        </a>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
            {expandedAttachment && (
              <div className="attachment-lightbox" role="dialog" aria-modal="true" aria-label={`Preview ${expandedAttachment.title}`} onClick={() => setExpandedAttachment(null)}>
                <div className="attachment-lightbox-card" onClick={event => event.stopPropagation()}>
                  <div className="attachment-lightbox-header">
                    <span>{expandedAttachment.title}</span>
                    <a href={attachmentUrl(expandedAttachment.id, expandedAttachment.title, true)} title="Download attachment"><Download size={15} /></a>
                    <button type="button" onClick={() => setExpandedAttachment(null)} aria-label="Close attachment preview"><X size={17} /></button>
                  </div>
                  <div className="attachment-lightbox-canvas">
                    <img src={attachmentUrl(expandedAttachment.id, expandedAttachment.title)} alt={expandedAttachment.title} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null
      ) : loading ? (
        <div className="code-viewer-empty"><span className="code-viewer-loader" /><span>Opening file…</span></div>
      ) : error ? (
        <div className="code-viewer-empty"><FileCode2 size={28} /><strong>Couldn’t open this file</strong><span>{error}</span></div>
      ) : !file ? (
        <div className="code-viewer-empty">
          <FileCode2 size={32} />
          <strong>Select code from Bob’s answer</strong>
          <span>Local file paths in responses will appear as “Open code” buttons.</span>
          <button className="code-copy-button" onClick={onOpenMcpConfig}><Settings2 size={13} /> View MCP config</button>
        </div>
      ) : (
        <>
          <div className="code-viewer-filebar">
            <div style={{ minWidth: 0 }}>
              <div className="code-viewer-name">{file.name}</div>
              <div className="code-viewer-path" title={file.path}>{file.path}</div>
            </div>
            {isMarkdown && (
              <div className="markdown-view-switch" aria-label="Markdown display mode">
                <button className={markdownPreview ? 'is-active' : ''} onClick={() => setMarkdownPreview(true)} aria-pressed={markdownPreview} title="Rendered Markdown preview"><Eye size={12} /> Preview</button>
                <button className={!markdownPreview ? 'is-active' : ''} onClick={() => setMarkdownPreview(false)} aria-pressed={!markdownPreview} title="Markdown source"><Code2 size={12} /> Source</button>
              </div>
            )}
            {isHtml && (
              <div className="markdown-view-switch" aria-label="HTML display mode">
                <button className={htmlPreview ? 'is-active' : ''} onClick={() => setHtmlPreview(true)} aria-pressed={htmlPreview} title="Rendered HTML preview"><Eye size={12} /> Preview</button>
                <button className={!htmlPreview ? 'is-active' : ''} onClick={() => setHtmlPreview(false)} aria-pressed={!htmlPreview} title="HTML source"><Code2 size={12} /> Source</button>
              </div>
            )}
            {(!isMarkdown || !markdownPreview) && (!isHtml || !htmlPreview) && (
              <button className={`code-copy-button${wrapLines ? ' is-active' : ''}`} onClick={toggleWrap} title={wrapLines ? 'Disable line wrapping' : 'Wrap long lines'} aria-pressed={wrapLines}>
                <WrapText size={13} /> Wrap
              </button>
            )}
            <button className="code-copy-button" onClick={() => void copyCode()} title="Copy file contents">
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="code-viewer-meta">{file.extension ? file.extension.toUpperCase() : 'TEXT'} · {formatBytes(file.size)} · Read only</div>
          {isMarkdown && markdownPreview ? (
            <div className="code-viewer-markdown prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{file.content}</ReactMarkdown>
            </div>
          ) : isHtml && htmlPreview ? (
            <iframe
              srcDoc={file.content}
              sandbox="allow-same-origin"
              title={file.name}
              style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
            />
          ) : (
            <div className={`code-viewer-scroll${wrapLines ? ' wrap-lines' : ''}`}>
              <pre><code className={`hljs${file.extension ? ` language-${file.extension}` : ''}`} dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
