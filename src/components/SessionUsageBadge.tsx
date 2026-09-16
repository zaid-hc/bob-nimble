import { useEffect, useRef, useState } from 'react';
import { Activity, X } from 'lucide-react';
import type { SessionUsage } from '../types';

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export function SessionUsageBadge({ usage }: { usage: SessionUsage | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tokens = usage?.totalTokens ?? ((usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0));

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className="session-usage" ref={rootRef}>
      <button
        className="session-usage-trigger"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label="Show current Bob session usage"
        title="Current Bob session usage"
      >
        <Activity size={14} />
        <span>{usage ? `${compactNumber(tokens)} tokens` : 'Usage'}</span>
      </button>

      {open && (
        <section className="session-usage-popover" aria-label="Bob session usage details">
          <div className="session-usage-heading">
            <div>
              <strong>Session usage</strong>
              <span>{usage ? 'Latest completed response' : 'Available after Bob responds'}</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close usage details"><X size={15} /></button>
          </div>

          <div className="session-usage-context">
            <div><strong>Tokens used</strong><span>{usage ? compactNumber(tokens) : 'Not reported'}</span></div>
          </div>

          <dl className="session-usage-grid">
            <dt>Task ID</dt><dd title={usage?.taskId}>{usage?.taskId ?? 'Not started'}</dd>
            <dt>Workspace</dt><dd>{usage?.workspace ?? '—'}</dd>
            <dt>Tokens</dt><dd>↑ {compactNumber(usage?.inputTokens ?? 0)} <span>↓ {compactNumber(usage?.outputTokens ?? 0)}</span></dd>
            <dt>Cache</dt><dd className="session-usage-muted">Not reported by Bob Shell</dd>
            <dt>Context window</dt><dd className="session-usage-muted">Not reported by Bob Shell</dd>
            <dt>Reported cost</dt><dd>{usage?.apiCost != null ? usage.apiCost.toFixed(2) : '—'} <span className="session-usage-muted">(Bob units; currency unverified)</span></dd>
          </dl>
        </section>
      )}
    </div>
  );
}
