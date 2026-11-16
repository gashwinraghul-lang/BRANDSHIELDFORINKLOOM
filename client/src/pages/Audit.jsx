// client/src/pages/Audit.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, History, Search, ChevronDown } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { PageHeader, Badge, EmptyState, ErrorNotice, SkeletonLines, Field } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';

export default function Audit() {
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });
  const [expanded, setExpanded] = useState(null);

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const query = useQuery({ queryKey: ['audit', suffix], queryFn: () => endpoints.audit(suffix) });
  const entries = query.data?.entries || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Append-only record of sign-ins, knowledge changes, reviews, decisions, overrides and approvals. Newest first."
        actions={
          <a className="btn btn-sm" href="/api/audit/export.csv" download>
            <Download size={14} /> Export CSV
          </a>
        }
      />

      <div className="card card-pad">
        <div className="grid grid-4" style={{ gap: 12 }}>
          <Field label="Action contains" htmlFor="audit-action">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
              <input id="audit-action" className="input" style={{ paddingLeft: 32 }} value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} placeholder="finding.overridden" />
            </div>
          </Field>
          <Field label="Entity type" htmlFor="audit-entity">
            <select id="audit-entity" className="select" value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}>
              <option value="">All entities</option>
              {['user', 'organization', 'guideline', 'terminology_term', 'approved_fact', 'brand_asset', 'submission', 'finding', 'comment', 'agent'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="audit-from">
            <input id="audit-from" className="input" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </Field>
          <Field label="To" htmlFor="audit-to">
            <input id="audit-to" className="input" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </Field>
        </div>
      </div>

      {query.error ? <ErrorNotice error={query.error} onRetry={() => query.refetch()} /> : null}

      <section className="card">
        {query.isLoading ? <div className="card-pad"><SkeletonLines lines={7} /></div> : entries.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Action</th><th>Entity</th><th>User</th><th>Details</th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ verticalAlign: 'top' }}>
                    <td className="tiny muted nowrap">{formatDateTime(entry.created_at)}</td>
                    <td><Badge>{entry.action}</Badge></td>
                    <td className="tiny">
                      {entry.entity_type || '—'}
                      {entry.entity_id ? <span className="muted"> #{entry.entity_id}</span> : null}
                    </td>
                    <td className="tiny">
                      {entry.user_name || 'System'}
                      <div className="muted">{entry.user_email || ''}</div>
                    </td>
                    <td className="tiny" style={{ maxWidth: 340 }}>
                      {entry.details ? (
                        <>
                          <button className="link-button tiny row" style={{ gap: 4 }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                            <ChevronDown size={12} style={{ transform: expanded === entry.id ? 'rotate(180deg)' : undefined }} /> {expanded === entry.id ? 'Hide' : 'View'}
                          </button>
                          {expanded === entry.id ? (
                            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6, color: 'var(--text-2)' }}>
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          ) : (
                            <div className="truncate muted">{JSON.stringify(entry.details)}</div>
                          )}
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-pad">
            <EmptyState icon={History} title="No audit entries match" description="Try clearing the filters. Entries are written by the server for every sensitive action." />
          </div>
        )}
      </section>
    </div>
  );
}
