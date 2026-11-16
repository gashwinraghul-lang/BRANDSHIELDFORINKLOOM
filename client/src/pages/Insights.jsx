// client/src/pages/Insights.jsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
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
import { BarChart3, Quote, Plus, Sparkles, ShieldAlert, AlertTriangle, TrendingUp } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  PageHeader,
  SkeletonLines,
  Spinner,
  StatCard,
} from '../components/ui.jsx';
import { categoryLabel, formatDate, percent } from '../lib/format.js';

const TOOLTIP_STYLE = {
  background: '#0b1a2c',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 10,
  fontSize: 12,
  color: '#e9eff8',
};
const SEV_COLORS = { error: '#FF6B6B', warning: '#F5B942', suggestion: '#B8A9FF', info: '#5FE3F5' };

export default function Insights() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [addFor, setAddFor] = useState(null);
  const [form, setForm] = useState({ statement: '', source: '', owner: '', expiresAt: '', tags: 'from-insights' });

  const overview = useQuery({ queryKey: ['overview'], queryFn: endpoints.overview });
  const unsourced = useQuery({ queryKey: ['unsourced-claims'], queryFn: endpoints.unsourcedClaims });
  const guidelineInsights = useQuery({ queryKey: ['guideline-insights'], queryFn: endpoints.guidelineInsights });
  const confidentiality = useQuery({ queryKey: ['confidentiality'], queryFn: endpoints.confidentiality });

  const canManageFacts = ['admin', 'manager', 'reviewer'].includes(user?.role);
  const data = overview.data;

  const addFact = useMutation({
    mutationFn: ({ id, body }) => endpoints.addFactFromClaim(id, body),
    onSuccess: () => {
      success('Added to approved facts.');
      setAddFor(null);
      queryClient.invalidateQueries({ queryKey: ['unsourced-claims'] });
      queryClient.invalidateQueries({ queryKey: ['facts'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-summary'] });
    },
    onError: (err) => toastError(err.message || 'Could not add that fact'),
  });

  function openAdd(claim) {
    setAddFor(claim);
    setForm({
      statement: claim.claim_text,
      source: '',
      owner: '',
      expiresAt: '',
      tags: 'from-insights',
    });
  }

  const categoryData = (data?.categories || []).map((row) => ({
    name: categoryLabel[row.category] || row.category,
    findings: Number(row.n),
    serious: Number(row.serious),
  }));
  const severityData = Object.entries(data?.severities || {})
    .map(([key, value]) => ({ name: key, value: Number(value) }))
    .filter((row) => row.value > 0);
  const weeklyData = (data?.weekly || []).map((row) => ({ week: row.week, submissions: Number(row.submissions) }));
  const guidelineRows = guidelineInsights.data?.guidelines || [];
  const claimRows = unsourced.data?.claims || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Governance"
        title="Insights"
        description="Where reviews are spending effort, which rules writers struggle with, which claims lack evidence, and how fast decisions happen. Aggregated — never a leaderboard of individuals."
      />

      {overview.error ? <ErrorNotice error={overview.error} onRetry={() => overview.refetch()} /> : null}

      {overview.isLoading ? <div className="card card-pad"><SkeletonLines lines={4} /></div> : (
        <div className="grid grid-4">
          <StatCard label="Approval rate" value={data?.totals?.decided ? percent(data.totals.approvalRate) : '—'} note={`${data?.totals?.approved || 0} approved of ${data?.totals?.decided || 0} decided`} icon={TrendingUp} tone="var(--green)" />
          <StatCard label="Avg turnaround" value={data?.totals?.avgTurnaroundHours != null ? `${data.totals.avgTurnaroundHours}h` : '—'} note="From submission to decision" icon={BarChart3} />
          <StatCard label="Claims without a source" value={claimRows.reduce((sum, row) => sum + Number(row.frequency), 0)} note={`${claimRows.length} distinct recurring claims`} icon={Quote} tone="var(--lilac)" />
          <StatCard label="Guidelines flagged" value={guidelineInsights.data?.needsClarity ?? '—'} note={`${guidelineInsights.data?.insufficientData ?? 0} need more data`} icon={Sparkles} tone="var(--amber)" />
        </div>
      )}

      <div className="grid grid-2">
        <section className="card card-pad stack-sm">
          <div className="row-between wrap">
            <div><h3>Findings by category</h3><span className="tiny muted">Purple: all findings. Cyan: errors and warnings.</span></div>
          </div>
          {categoryData.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
                  <YAxis tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="findings" fill="#6C5CE7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="serious" fill="#5FE3F5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState icon={BarChart3} title="No findings yet" description="Insights fill in after your first review." />}
        </section>

        <section className="card card-pad stack-sm">
          <div><h3>Severity mix</h3><span className="tiny muted">How serious the findings are.</span></div>
          {severityData.length ? (
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              <div style={{ width: 200, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none">
                      {severityData.map((row) => <Cell key={row.name} fill={SEV_COLORS[row.name] || '#8fa2ba'} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="stack-sm grow">
                {severityData.map((row) => (
                  <div key={row.name} className="row-between">
                    <span className="row tiny" style={{ gap: 7 }}><span className="badge-dot" style={{ background: SEV_COLORS[row.name], color: SEV_COLORS[row.name] }} />{row.name}</span>
                    <strong className="tiny">{row.value}</strong>
                  </div>
                ))}
                <div className="tiny muted mt-2">Decisions, not scores: a finding can be accepted, rejected or overridden with a reason.</div>
              </div>
            </div>
          ) : <EmptyState icon={AlertTriangle} title="No severity data" description="Run a review to see the mix." />}
        </section>
      </div>

      <section className="card card-pad stack-sm">
        <div><h3>Submission trend</h3><span className="tiny muted">Last eight weeks.</span></div>
        {weeklyData.length ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5FE3F5" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#6C5CE7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8fa2ba', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="submissions" stroke="#5FE3F5" strokeWidth={2} fill="url(#weeklyFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="tiny muted">No submissions in the last eight weeks.</p>}
      </section>

      <div className="grid grid-2">
        <section className="card card-pad stack-sm">
          <div className="row-between wrap">
            <div><h3>Most-triggered rules</h3><span className="tiny muted">Accepted vs rejected shows how useful each rule is.</span></div>
          </div>
          {(data?.topRules || []).length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Rule</th><th>Category</th><th>Triggers</th><th>Accepted</th><th>Rejected</th></tr></thead>
                <tbody>
                  {data.topRules.map((rule) => (
                    <tr key={`${rule.rule}-${rule.category}`}>
                      <td className="tiny">{rule.rule}</td>
                      <td><Badge>{categoryLabel[rule.category] || rule.category}</Badge></td>
                      <td className="tiny">{rule.n}</td>
                      <td className="tiny" style={{ color: 'var(--green)' }}>{rule.accepted}</td>
                      <td className="tiny" style={{ color: 'var(--red)' }}>{rule.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={AlertTriangle} title="No rule data yet" description="Rules appear after findings are generated." />}
        </section>

        <section className="card card-pad stack-sm">
          <div><h3>Findings by role</h3><span className="tiny muted">Aggregate by role, not by person.</span></div>
          {(data?.byRole || []).length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Role</th><th>Submissions</th><th>Findings</th><th>Rejected</th></tr></thead>
                <tbody>
                  {data.byRole.map((row) => (
                    <tr key={row.role}>
                      <td className="tiny" style={{ textTransform: 'capitalize' }}>{row.role}</td>
                      <td className="tiny">{row.submissions}</td>
                      <td className="tiny">{row.findings}</td>
                      <td className="tiny" style={{ color: 'var(--amber)' }}>{row.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="tiny muted">No role data yet.</p>}
        </section>
      </div>

      <section className="card card-pad stack-sm">
        <div className="row-between wrap">
          <div>
            <h3>Claims that keep appearing with no source</h3>
            <span className="tiny muted">Ranked by frequency. Add a verified statement to approved facts so future reviews can cite it.</span>
          </div>
          <Quote size={17} style={{ color: 'var(--cyan)' }} />
        </div>
        {claimRows.length ? (
          <div className="stack-sm">
            {claimRows.map((claim, index) => (
              <div key={`${claim.claim_text}-${index}`} className="kb-item row-between wrap" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 260 }}>
                  <div className="tiny" style={{ color: 'var(--text)' }}>“{claim.claim_text}”</div>
                  <div className="tiny muted mt-1">{claim.frequency} occurrence{claim.frequency === 1 ? '' : 's'} · last seen {formatDate(claim.last_seen)}</div>
                </div>
                <div className="row wrap">
                  <Badge tone="tone-indigo">{claim.frequency}×</Badge>
                  {canManageFacts ? (
                    <button className="btn btn-sm" onClick={() => openAdd(claim)}><Plus size={12} /> Add to approved facts</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Quote} title="No recurring unsourced claims" description="Every claim that appeared with no source has either been resolved or has only appeared once." />
        )}
      </section>

      <section className="card card-pad stack-sm">
        <div className="row-between wrap">
          <div>
            <h3>Guideline clarity ranking</h3>
            <span className="tiny muted">A rule is flagged only above the configured rate and minimum sample size. Insufficient data never claims improvement.</span>
          </div>
          <Badge>{guidelineInsights.data?.needsClarity || 0} flagged</Badge>
        </div>
        {guidelineInsights.isLoading ? <SkeletonLines lines={4} /> : guidelineRows.length ? (
          <div className="stack-sm">
            {guidelineRows.map((row) => (
              <div key={row.guideline.id} className="kb-item stack-sm">
                <div className="row-between wrap">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="version-pill">v{row.guideline.version}</span>
                    <strong className="tiny" style={{ color: 'var(--text)' }}>{row.guideline.title}</strong>
                    {row.needsClarity ? <Badge tone="tone-amber">needs clarity</Badge> : <Badge tone="tone-green">healthy</Badge>}
                    {row.sampleSize < row.minimumSample ? <Badge>needs more data</Badge> : null}
                  </div>
                  <span className="tiny muted">{row.sampleSize} samples · threshold {percent(row.threshold)}</span>
                </div>
                <div className="grid grid-3" style={{ gap: 10 }}>
                  <div><div className="tiny muted">Override rate</div><div className="tiny">{percent(row.overrideRate)}</div></div>
                  <div><div className="tiny muted">Rejection rate</div><div className="tiny">{percent(row.rejectionRate)}</div></div>
                  <div><div className="tiny muted">Triggers</div><div className="tiny">{row.triggers}</div></div>
                </div>
                <div className="tiny muted">{row.evidence}</div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={Sparkles} title="No clarity data yet" description="Once findings trigger guidelines and reviewers make decisions, the ranking appears here. Open a guideline in Brand knowledge to draft a clearer version." />}
      </section>

      <section className="card card-pad stack-sm">
        <div><h3>Confidentiality &amp; external calls</h3><span className="tiny muted">Restricted material never leaves this server.</span></div>
        {confidentiality.isLoading ? <SkeletonLines lines={3} /> : confidentiality.data ? (
          <div className="grid grid-3">
            <div className="panel card-pad">
              <div className="stat-label">Restricted submissions</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>{confidentiality.data.restrictedSubmissions}</div>
              <div className="tiny muted">Reviewed entirely locally</div>
            </div>
            <div className="panel card-pad">
              <div className="stat-label">External AI calls</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>{confidentiality.data.externalAiCalls}</div>
              <div className="tiny muted">Logged in ai_call_log</div>
            </div>
            <div className="panel card-pad">
              <div className="stat-label">Restricted facts</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>
                {(confidentiality.data.facts || []).find((row) => row.confidentiality === 'restricted')?.n || 0}
              </div>
              <div className="tiny muted">Excluded from external prompts</div>
            </div>
          </div>
        ) : null}
        <div className="row wrap">
          <Badge tone="tone-red"><ShieldAlert size={11} /> restricted</Badge>
          <span className="tiny muted">Public and internal knowledge may be sent to Groq for supported review categories, with contact details redacted.</span>
        </div>
      </section>

      <Modal
        open={Boolean(addFor)}
        onClose={() => setAddFor(null)}
        title="Add to approved facts"
        subtitle="This creates a normal knowledge-base fact. Future claim checks can cite it."
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setAddFor(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={addFact.isPending || form.statement.trim().length < 5}
              onClick={() => addFact.mutate({ id: addFor.sample_claim_id, body: { ...form } })}
            >
              {addFact.isPending ? <Spinner size={14} /> : <Plus size={14} />} Add approved fact
            </button>
          </>
        }
      >
        <div className="stack-sm">
          <Field label="Statement" htmlFor="insight-fact-statement"><textarea id="insight-fact-statement" className="textarea" style={{ minHeight: 90 }} value={form.statement} onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))} /></Field>
          <div className="grid grid-2">
            <Field label="Source" htmlFor="insight-fact-source"><input id="insight-fact-source" className="input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="Analytics, Q2 2026" /></Field>
            <Field label="Owner" htmlFor="insight-fact-owner"><input id="insight-fact-owner" className="input" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} placeholder="Data team" /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Expires" htmlFor="insight-fact-expiry"><input id="insight-fact-expiry" className="input" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></Field>
            <Field label="Tags" htmlFor="insight-fact-tags"><input id="insight-fact-tags" className="input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
