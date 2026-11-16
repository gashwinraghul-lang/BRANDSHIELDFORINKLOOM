// client/src/lib/format.js
export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...options });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(
    undefined,
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(value);
}

export const severityOrder = ['error', 'warning', 'suggestion', 'info'];
export const severityLabel = { error: 'Error', warning: 'Warning', suggestion: 'Suggestion', info: 'Info' };
export const statusLabel = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
};
export const statusTone = {
  draft: 'tone-muted',
  in_review: 'tone-indigo',
  changes_requested: 'tone-amber',
  approved: 'tone-green',
  rejected: 'tone-red',
};

export const categoryLabel = {
  tone: 'Tone',
  terminology: 'Terminology',
  claims: 'Claims',
  messaging: 'Messaging',
  visual: 'Visual',
  accessibility: 'Accessibility',
};

export const verdictTone = {
  supported: 'tone-green',
  contradicted: 'tone-red',
  outdated: 'tone-amber',
  unsupported: 'tone-indigo',
};

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function parseDiff(before = '', after = '') {
  const a = before.split(/\n/);
  const b = after.split(/\n/);
  const max = Math.max(a.length, b.length);
  const rows = [];
  for (let i = 0; i < max; i += 1) {
    rows.push({ before: a[i] ?? '', after: b[i] ?? '', changed: a[i] !== b[i] });
  }
  return rows;
}
