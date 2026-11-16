// client/src/components/ui.jsx
import { Loader2, X, Info, AlertTriangle, Sparkles } from 'lucide-react';
import { categoryLabel, statusLabel, statusTone, severityLabel } from '../lib/format.js';

export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`spin ${className}`} aria-hidden="true" />;
}

export function Badge({ children, tone = '', className = '', title }) {
  return (
    <span className={`badge ${tone} ${className}`} title={title}>
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  return <Badge tone={`sev-${severity}`}>{severityLabel[severity] || severity}</Badge>;
}

export function CategoryBadge({ category }) {
  return <Badge tone="tone-indigo">{categoryLabel[category] || category}</Badge>;
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone[status] || 'tone-muted'}>{statusLabel[status] || status}</Badge>;
}

export function EngineBadge({ engine }) {
  if (!engine) return null;
  const llm = String(engine).startsWith('llm');
  return (
    <Badge tone={llm ? 'tone-indigo' : 'tone-muted'} title={llm ? 'Generated with a language model' : 'Deterministic rules, no external service'}>
      {llm ? 'AI · ' : ''}
      {String(engine).replace(/^llm:/, '')}
    </Badge>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="row-between wrap mb-3" style={{ alignItems: 'flex-start' }}>
      <div className="stack-sm" style={{ maxWidth: 720 }}>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)' }}>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </div>
  );
}

export function Field({ label, hint, error, htmlFor, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <span className="error-text">{error}</span> : null}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, width }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <div className="tiny muted mt-1">{subtitle}</div> : null}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? (
          <div className="modal-head" style={{ position: 'sticky', bottom: 0, top: 'auto', borderTop: '1px solid var(--line)', borderBottom: 'none', justifyContent: 'flex-end' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, description, action }) {
  return (
    <div className="empty stack-sm" style={{ alignItems: 'center' }}>
      {Icon ? <Icon size={26} style={{ opacity: 0.7 }} /> : null}
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      {description ? <span className="tiny" style={{ maxWidth: 460 }}>{description}</span> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function SkeletonLines({ lines = 3, height = 14 }) {
  return (
    <div className="stack-sm" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height, width: index === lines - 1 ? '62%' : '100%' }} />
      ))}
    </div>
  );
}

export function DisclosurePanel({ compact = false }) {
  return (
    <div className={`disclosure ${compact ? 'tiny' : ''}`}>
      <strong>How AI is used.</strong>{' '}
      Groq receives submitted text with emails and phone numbers redacted, and only when the content is not restricted.
      Restricted facts, assets, guidelines and submissions are never sent to an external service. OCR, pixel analysis
      and retrieval run locally. Findings are suggestions — a human makes every final decision. Content sent through
      the Agentverse chatbot is processed by the BrandShield Reviewer agent.
    </div>
  );
}

export function StatCard({ label, value, note, tone, icon: Icon }) {
  return (
    <div className="card card-pad stat">
      <div className="row-between">
        <span className="stat-label">{label}</span>
        {Icon ? <Icon size={16} style={{ color: tone || 'var(--cyan)' }} /> : null}
      </div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="card card-pad" style={{ borderColor: 'rgba(255,107,107,0.4)' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <AlertTriangle size={18} style={{ color: 'var(--red)', flex: 'none', marginTop: 2 }} />
        <div className="stack-sm grow">
          <strong>The server could not complete that request.</strong>
          <span className="tiny muted">{error.message || String(error)}</span>
          {error.code ? <span className="tiny muted">Code: {error.code}</span> : null}
          {onRetry ? (
            <div>
              <button className="btn btn-sm" onClick={onRetry}>Try again</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AiSpark({ children }) {
  return (
    <span className="badge tone-indigo" title="AI-assisted">
      <Sparkles size={12} /> {children}
    </span>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`tab ${value === tab.value ? 'active' : ''}`}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          type="button"
        >
          {tab.label}
          {tab.count !== undefined ? <span className="muted tiny" style={{ marginLeft: 7 }}>{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
