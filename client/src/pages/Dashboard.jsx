// client/src/pages/Dashboard.jsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
  Quote,
  Gauge,
} from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  PageHeader,
  StatCard,
  StatusBadge,
  SkeletonLines,
  ErrorNotice,
  EmptyState,
  Badge,
  DisclosurePanel,
} from '../components/ui.jsx';
import { categoryLabel, formatDateTime, percent, relativeTime } from '../lib/format.js';

const TOOLTIP_STYLE = {
  background: '#0b1a2c',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 10,
  fontSize: 12,
  color: '#e9eff8',
};

export default function Dashboard() {
  const { user } = useAuth();
  const overview = useQuery({ queryKey: ['overview'], queryFn: endpoints.overview });
  const workflow = useQuery({ queryKey: ['workflow-summary'], queryFn: endpoints.workflowSummary });
  const recent = useQuery({ queryKey: ['submissions', 'recent'], queryFn: () => endpoints.submissions() });
  const assigned = useQuery({ queryKey: ['submissions', 'assigned'], queryFn: () => endpoints.submissions('?assigned=true') });
  const claims = useQuery({ queryKey: ['unsourced-claims'], queryFn: endpoints.unsourcedClaims });

  const data = overview.data;
  const submissions = recent.data?.submissions || [];
  const assignedItems = assigned.data?.submissions || [];
  const needsAttention = submissions.filter((s) => ['in_review', 'changes_requested'].includes(s.status)).slice(0, 5);
  const categoryData = (data?.categories || []).slice(0, 6).map((row) => ({
    name: categoryLabel[row.category] || row.category,
    findings: Number(row.n),
    serious: Number(row.serious),
  }));
  const severityData = Object.entries(data?.severities || {})
    .map(([key, value]) => ({ name: key, value: Number(value) }))
    .filter((row) => row.value > 0);
  const severityColors = { error: '#FF6B6B', warning: '#F5B942', suggestion: '#B8A9FF', info: '#5FE3F5' };
  const unsourced = (claims.data?.claims || []).slice(0, 5);

  return (
    <div className="stack">
      <PageHeader
        eyebrow={user?.organizationName}
        title={`Good to see you, ${(user?.name || 'there').split(' ')[0]}.`}
        description="Here is what is waiting for review, what keeps triggering, and how your brand knowledge is holding up."
        actions={
          <>
            <Link to="/app/knowledge" className="btn btn-sm">Brand knowledge</Link>
            <Link to="/app/reviews/new" className="btn btn-primary btn-sm"><Plus size={14} /> New review</Link>
          </>
        }
      />

      {overview.error ? <ErrorNotice error={overview.error} onRetry={() => overview.refetch()} /> : null}

      {overview.isLoading ? (
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="card card-pad"><SkeletonLines lines={3} /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-4">
          <StatCard
            label="Submissions"
            value={data?.totals?.submissions ?? 0}
            note={`${workflow.data?.byStatus?.in_review || 0} awaiting review`}
            icon={FileText}
          />
          <StatCard
            label="Approval rate"
            value={data?.totals?.decided ? percent(data.totals.approvalRate) : '—'}
            note={data?.totals?.decided ? `${data.totals.approved} of ${data.totals.decided} decided` : 'No decisions yet'}
            icon={ShieldCheck}
            tone="var(--green)"
          />
          <StatCard
            label="Avg turnaround"
            value={data?.totals?.avgTurnaroundHours != null ? `${data.totals.avgTurnaroundHours}h` : '—'}
            note={data?.totals?.avgTurnaroundHours != null ? 'Submission to decision' : 'Waiting for the first decision'}
            icon={Clock}
          />
          <StatCard
            label="Assigned to me"
            value={workflow.data?.assignedToMe ?? 0}
            note={workflow.data?.canReview ? 'You can approve or request changes' : 'Your drafts and change requests'}
            icon={Gauge}
            tone="var(--lilac)"
          />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)' }}>
        <section className="card card-pad">
          <div className="row-between wrap mb-2">
            <div>
              <h3>Needs attention</h3>
              <span className="tiny muted">In review or waiting on the author.</span>
            </div>
            <Link to="/app/submissions" className="btn btn-ghost btn-sm">All submissions <ArrowRight size={14} /></Link>
          </div>
          {recent.isLoading ? (
            <SkeletonLines lines={5} />
          ) : needsAttention.length ? (
            <div>
              {needsAttention.map((item) => (
                <Link
                  key={item.id}
                  to={`/app/reviews/${item.id}`}
                  className="list-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong className="truncate" style={{ fontSize: '0.92rem' }}>{item.title}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="tiny muted mt-1">
                      {item.creator_name} · {relativeTime(item.updated_at)} · {item.findings_count} findings
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="Nothing waiting."
              description="When a creator submits content for review it will appear here."
              action={<Link to="/app/reviews/new" className="btn btn-sm">Run a review</Link>}
            />
          )}

          <div className="divider mt-3 mb-2" />
          <div className="row-between wrap mb-1">
            <h3>Assigned to me</h3>
            <span className="tiny muted">{assignedItems.length} open</span>
          </div>
          {assignedItems.length ? (
            assignedItems.slice(0, 4).map((item) => (
              <Link key={item.id} to={`/app/reviews/${item.id}`} className="list-row" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: '0.9rem' }}>{item.title}</div>
                  <div className="tiny muted">{item.creator_name} · due your decision</div>
                </div>
                <StatusBadge status={item.status} />
              </Link>
            ))
          ) : (
            <p className="tiny muted">No reviews are assigned to you right now.</p>
          )}
        </section>

        <section className="card card-pad">
          <div className="row-between wrap mb-2">
            <div>
              <h3>Findings by category</h3>
              <span className="tiny muted">All time.</span>
            </div>
          </div>
          {categoryData.length ? (
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                  <YAxis tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="findings" fill="#6C5CE7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="serious" fill="#5FE3F5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} title="No findings yet" description="Run your first review to see how your content measures up." />
          )}
          <div className="divider mt-2 mb-2" />
          <div className="row" style={{ alignItems: 'center', gap: 14 }}>
            {severityData.length ? (
              <>
                <div style={{ width: 120, height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={54} paddingAngle={3} stroke="none">
                        {severityData.map((entry) => (
                          <Cell key={entry.name} fill={severityColors[entry.name] || '#8fa2ba'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="stack-sm grow">
                  {severityData.map((row) => (
                    <div key={row.name} className="row-between">
                      <span className="row tiny" style={{ gap: 7 }}>
                        <span className="badge-dot" style={{ background: severityColors[row.name], color: severityColors[row.name] }} />
                        {row.name}
                      </span>
                      <strong className="tiny">{row.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span className="tiny muted">Severity breakdown appears after the first review.</span>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card card-pad">
          <div className="row-between wrap mb-2">
            <div>
              <h3>Claims with no source</h3>
              <span className="tiny muted">Suggestions only. They never block a submission.</span>
            </div>
            <Quote size={16} style={{ color: 'var(--cyan)' }} />
          </div>
          {unsourced.length ? (
            <div className="stack-sm">
              {unsourced.map((claim) => (
                <div key={claim.claim_text} className="kb-item">
                  <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
                    <span className="tiny" style={{ maxWidth: 460 }}>“{claim.claim_text}”</span>
                    <Badge tone="tone-indigo">{claim.frequency}×</Badge>
                  </div>
                  <div className="tiny muted mt-1">Last seen {relativeTime(claim.last_seen)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Quote} title="No recurring unsourced claims" description="When the same unsourced claim appears repeatedly it is ranked here, with a prefilled “add to approved facts” action." />
          )}
          <Link to="/app/insights" className="btn btn-sm mt-3">Open insights <ArrowRight size={14} /></Link>
        </section>

        <section className="card card-pad">
          <div className="row-between wrap mb-2">
            <div>
              <h3>Most-triggered rules</h3>
              <span className="tiny muted">Where reviewers spend their time.</span>
            </div>
            <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
          </div>
          {(data?.topRules || []).length ? (
            <div className="stack-sm">
              {data.topRules.slice(0, 6).map((rule) => (
                <div key={`${rule.rule}-${rule.category}`} className="row-between" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="tiny truncate" style={{ color: 'var(--text)' }}>{rule.rule}</div>
                    <div className="tiny muted">{categoryLabel[rule.category] || rule.category} · {rule.rejected} rejected of {rule.n}</div>
                  </div>
                  <Badge tone={rule.rejected > rule.accepted ? 'tone-amber' : ''}>{rule.n}×</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={AlertTriangle} title="No rule data yet" description="Run reviews and decide on findings to build this ranking." />
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <div className="panel card-pad">
          <h3 className="mb-2">Latest activity</h3>
          {submissions.length ? (
            submissions.slice(0, 5).map((item) => (
              <Link key={item.id} to={`/app/reviews/${item.id}`} className="list-row" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate tiny" style={{ color: 'var(--text)' }}>{item.title}</div>
                  <div className="tiny muted">{formatDateTime(item.created_at)} · {item.creator_name}</div>
                </div>
                <span className="tiny muted">{item.findings_count}</span>
              </Link>
            ))
          ) : (
            <p className="tiny muted">No submissions yet.</p>
          )}
        </div>
        <DisclosurePanel />
      </div>
    </div>
  );
}
