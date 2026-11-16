// client/src/pages/Submissions.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, Upload } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { PageHeader, StatusBadge, EmptyState, SkeletonLines, ErrorNotice, Badge } from '../components/ui.jsx';
import { relativeTime } from '../lib/format.js';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function Submissions() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [assigned, setAssigned] = useState(false);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q.trim()) params.set('q', q.trim());
  if (mine) params.set('mine', 'true');
  if (assigned) params.set('assigned', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const query = useQuery({
    queryKey: ['submissions', suffix],
    queryFn: () => endpoints.submissions(suffix),
  });
  const submissions = query.data?.submissions || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Workspace"
        title="Submissions"
        description="Everything submitted for a brand review, with its current workflow state."
        actions={
          <>
            <Link to="/app/reviews/new?upload=1" className="btn btn-sm"><Upload size={14} /> Upload</Link>
            <Link to="/app/reviews/new" className="btn btn-primary btn-sm"><Plus size={14} /> New review</Link>
          </>
        }
      />

      <div className="card card-pad stack-sm">
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="grow" style={{ minWidth: 220, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
            <input
              className="input"
              style={{ paddingLeft: 34 }}
              placeholder="Search titles…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search submissions"
            />
          </div>
          <select className="select" style={{ width: 190 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" className={`chip ${mine ? 'active' : ''}`} onClick={() => setMine((v) => !v)}>Created by me</button>
          <button type="button" className={`chip ${assigned ? 'active' : ''}`} onClick={() => setAssigned((v) => !v)}>Assigned to me</button>
        </div>
      </div>

      {query.error ? <ErrorNotice error={query.error} onRetry={() => query.refetch()} /> : null}

      <section className="card">
        {query.isLoading ? (
          <div className="card-pad"><SkeletonLines lines={6} /></div>
        ) : submissions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Status</th>
                  <th>Created by</th>
                  <th>Findings</th>
                  <th>Updated</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/app/reviews/${item.id}`} style={{ color: '#fff', fontWeight: 600 }}>{item.title}</Link>
                      <div className="tiny muted">
                        {item.content_type} · {item.confidentiality}
                        {item.assignee_name ? ` · assigned to ${item.assignee_name}` : ''}
                      </div>
                    </td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      <div className="tiny">{item.creator_name}</div>
                      <div className="tiny muted" style={{ textTransform: 'capitalize' }}>{item.creator_role}</div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <Badge>{item.findings_count}</Badge>
                        {item.issue_count ? <Badge tone="tone-amber">{item.issue_count} issues</Badge> : null}
                      </div>
                    </td>
                    <td className="tiny muted">{relativeTime(item.updated_at)}</td>
                    <td className="text-right">
                      <Link to={`/app/reviews/${item.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-pad">
            <EmptyState
              icon={FileText}
              title={q || status ? 'No submissions match those filters' : 'No submissions yet'}
              description={
                q || status
                  ? 'Clear the search or choose a different status.'
                  : 'Paste text or upload a document to see the brand review agents at work.'
              }
              action={<Link to="/app/reviews/new" className="btn btn-primary btn-sm"><Plus size={14} /> Run your first review</Link>}
            />
          </div>
        )}
      </section>
    </div>
  );
}
