// client/src/pages/review/ReviewFindings.jsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  X,
  PencilLine,
  RotateCcw,
  Wand2,
  Download,
  Quote,
  ShieldCheck,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import DecisionModal from '../../components/DecisionModal.jsx';
import {
  Badge,
  CategoryBadge,
  EmptyState,
  EngineBadge,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '../../components/ui.jsx';
import { categoryLabel, severityOrder } from '../../lib/format.js';

function useDecision(onDone) {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  return useMutation({
    mutationFn: ({ id, body }) => endpoints.decideFinding(id, body),
    onSuccess: (data, variables) => {
      success(`Finding marked ${variables.body.status}.`);
      queryClient.invalidateQueries({ queryKey: ['submission', String(variables.submissionId)] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      onDone?.();
    },
    onError: (err) => toastError(err.message || 'Could not save that decision'),
  });
}

function buildSegments(content, findings) {
  const spans = findings
    .map((finding) => {
      const start = Number(finding.location?.start);
      const end = Number(finding.location?.end);
      return { finding, start, end };
    })
    .filter(
      (span) =>
        Number.isFinite(span.start) &&
        Number.isFinite(span.end) &&
        span.end > span.start &&
        span.start >= 0 &&
        span.end <= content.length
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const kept = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.start >= lastEnd) {
      kept.push(span);
      lastEnd = span.end;
    }
  }

  const segments = [];
  let cursor = 0;
  for (const span of kept) {
    if (span.start > cursor) segments.push({ text: content.slice(cursor, span.start) });
    segments.push({ text: content.slice(span.start, span.end), finding: span.finding });
    cursor = span.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments;
}

export default function ReviewFindings() {
  const { submission, findings, refetch } = useOutletContext();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [override, setOverride] = useState(null);

  const decide = useDecision(() => setOverride(null));

  const categories = [...new Set(findings.map((finding) => finding.category))];
  const filtered = findings.filter((finding) => {
    if (severity !== 'all' && finding.severity !== severity) return false;
    if (category !== 'all' && finding.category !== category) return false;
    if (status !== 'all' && finding.status !== status) return false;
    return true;
  });

  const segments = useMemo(
    () => (submission.content_type === 'image' ? [] : buildSegments(submission.content || '', findings)),
    [findings, submission]
  );

  const rewrite = useMutation({
    mutationFn: () => endpoints.rewrite(submission.id, { purpose: submission.title }),
    onError: (err) => toastError(err.message || 'Could not generate a rewrite'),
  });

  const applyRewrite = useMutation({
    mutationFn: (content) =>
      endpoints.updateSubmission(submission.id, {
        content,
        note: 'Applied the BrandShield rewrite',
      }),
    onSuccess: () => {
      success('Rewrite applied as a new revision. The review is running again.');
      queryClient.invalidateQueries({ queryKey: ['submission', String(submission.id)] });
      rewrite.reset();
      refetch();
    },
    onError: (err) => toastError(err.message || 'Could not apply the rewrite'),
  });

  function chooseFinding(finding) {
    setSelected(finding.id);
    document.getElementById(`finding-${finding.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function mark(finding, nextStatus) {
    decide.mutate({
      id: finding.id,
      submissionId: submission.id,
      body: { status: nextStatus },
    });
  }

  if (!submission.content_type?.includes('image') && !submission.content?.trim()) {
    return (
      <EmptyState
        icon={FileText}
        title="No text to display"
        description="This submission has no extracted text. If it is a document, open the original file from the header."
      />
    );
  }

  return (
    <div className="stack">
      {submission.content_type === 'image' ? (
        <div className="card card-pad stack-sm">
          <div className="row-between wrap">
            <h3>Submitted image</h3>
            {submission.file_url ? (
              <a className="btn btn-sm" href={submission.file_url} target="_blank" rel="noreferrer">
                <Download size={14} /> Open original
              </a>
            ) : null}
          </div>
          {submission.file_url ? (
            <div style={{ background: 'rgba(2,6,12,0.6)', borderRadius: 12, padding: 12, display: 'grid', placeItems: 'center' }}>
              <img
                src={submission.file_url}
                alt={`Preview of ${submission.title}`}
                style={{ maxWidth: '100%', maxHeight: 460, borderRadius: 8 }}
              />
            </div>
          ) : (
            <p className="tiny muted">The image file is no longer available.</p>
          )}
          <p className="tiny muted">
            Visual checks measure palette distance with CIEDE2000, contrast with WCAG 2.1 and logo similarity against
            the approved assets. Regions are listed on each finding below.
          </p>
        </div>
      ) : (
        <div className="review-grid">
          <section className="card card-pad stack-sm" style={{ position: 'sticky', top: 78, maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
            <div className="row-between wrap">
              <h3>Submitted content</h3>
              <div className="row" style={{ gap: 6 }}>
                <Badge>{submission.confidentiality}</Badge>
                <span className="tiny muted">Revision {submission.current_revision}</span>
              </div>
            </div>
            <div className="content-body" aria-label="Submitted content with highlighted findings">
              {segments.length
                ? segments.map((segment, index) =>
                    segment.finding ? (
                      <mark
                        key={`${segment.finding.id}-${index}`}
                        className={`hl hl-${segment.finding.severity} ${selected === segment.finding.id ? 'active' : ''}`}
                        onClick={() => chooseFinding(segment.finding)}
                        title={`${segment.finding.category}: ${segment.finding.explanation}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => event.key === 'Enter' && chooseFinding(segment.finding)}
                      >
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={`text-${index}`}>{segment.text}</span>
                    )
                  )
                : submission.content}
            </div>
            <div className="tiny muted">
              Highlights are character spans. Only the first issue in overlapping spans is highlighted; all findings stay
              in the list.
            </div>
            {submission.file_url ? (
              <a className="btn btn-sm" href={submission.file_url} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
                <Download size={14} /> Open source file
              </a>
            ) : null}
          </section>

          <section className="stack-sm">
            <div className="card card-pad stack-sm">
              <div className="row-between wrap">
                <div className="row" style={{ gap: 8 }}>
                  <Quote size={16} style={{ color: 'var(--cyan)' }} />
                  <h3>Findings</h3>
                  <Badge>{filtered.length} of {findings.length}</Badge>
                </div>
                <button className="btn btn-sm" onClick={() => rewrite.mutate()} disabled={rewrite.isPending}>
                  {rewrite.isPending ? <Spinner size={14} /> : <Wand2 size={14} />}
                  {rewrite.isPending ? 'Rewriting…' : 'Suggest a rewrite'}
                </button>
              </div>
              <div className="filter-bar">
                <select className="select" style={{ width: 'auto' }} value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
                  <option value="all">All severities</option>
                  {severityOrder.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
                  <option value="all">All categories</option>
                  {categories.map((value) => <option key={value} value={value}>{categoryLabel[value] || value}</option>)}
                </select>
                <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="overridden">Overridden</option>
                </select>
              </div>
            </div>

            {rewrite.data ? (
              <div className="card card-pad stack-sm">
                <div className="row-between wrap">
                  <div className="row" style={{ gap: 8 }}>
                    <Wand2 size={15} style={{ color: 'var(--lilac)' }} />
                    <h3>Suggested rewrite</h3>
                    <EngineBadge engine={rewrite.data.engine} />
                  </div>
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => rewrite.reset()}>Dismiss</button>
                    <button className="btn btn-accept btn-sm" onClick={() => applyRewrite.mutate(rewrite.data.rewritten)} disabled={applyRewrite.isPending}>
                      {applyRewrite.isPending ? <Spinner size={13} /> : <Check size={13} />} Apply as new revision
                    </button>
                  </div>
                </div>
                <div className="diff">
                  <div>
                    <div className="tiny muted mb-1">Original</div>
                    <pre>{submission.content}</pre>
                  </div>
                  <div>
                    <div className="tiny muted mb-1">With the suggested corrections</div>
                    <pre>{rewrite.data.rewritten}</pre>
                  </div>
                </div>
                {rewrite.data.changes?.length ? (
                  <div className="stack-sm">
                    <div className="tiny muted">Changes to address</div>
                    {rewrite.data.changes.slice(0, 6).map((change, index) => (
                      <div key={index} className="tiny">• {change.change || change.reason || String(change)}</div>
                    ))}
                  </div>
                ) : null}
                <div className="tiny muted">
                  Applying creates a new revision, keeps the previous one, and re-runs the review. It is never automatic.
                </div>
              </div>
            ) : null}

            {filtered.length ? (
              <div className="stack-sm">
                {filtered.map((finding) => {
                  const pending = decide.isPending && decide.variables?.id === finding.id;
                  return (
                    <article
                      key={finding.id}
                      id={`finding-${finding.id}`}
                      className={`finding-card ${selected === finding.id ? 'selected' : ''}`}
                      onClick={() => setSelected(finding.id)}
                    >
                      <div className="finding-meta">
                        <SeverityBadge severity={finding.severity} />
                        <CategoryBadge category={finding.category} />
                        <EngineBadge engine={finding.engine} />
                        {finding.status !== 'open' ? <StatusBadge status={finding.status === 'overridden' ? 'approved' : undefined} /> : null}
                        {finding.status !== 'open' ? <Badge tone={finding.status === 'accepted' ? 'tone-green' : finding.status === 'rejected' ? 'tone-red' : 'tone-indigo'}>{finding.status}</Badge> : null}
                        {finding.confidence != null ? (
                          <span className="tiny muted" style={{ marginLeft: 'auto' }}>{Math.round(Number(finding.confidence) * 100)}% confidence</span>
                        ) : null}
                      </div>
                      {finding.title ? <div className="finding-title">{finding.title}</div> : null}
                      <p className="tiny mt-1">{finding.explanation}</p>
                      {finding.source_reference ? (
                        <div className="tiny muted mt-1">
                          Source: <span className="mono">{finding.source_reference}</span>
                        </div>
                      ) : null}
                      {finding.confidence != null ? (
                        <div className="confidence-bar mt-2" aria-hidden="true">
                          <div className="confidence-fill" style={{ width: `${Math.round(Number(finding.confidence) * 100)}%` }} />
                        </div>
                      ) : null}
                      {finding.suggested_fix ? (
                        <div className="finding-fix">
                          <strong style={{ color: 'var(--green)' }}>Suggested correction.</strong> {finding.suggested_fix}
                        </div>
                      ) : null}
                      {finding.reviewer_reason ? (
                        <div className="tiny muted mt-2">Decision note: {finding.reviewer_reason}</div>
                      ) : null}
                      {finding.location?.start != null ? (
                        <div className="tiny muted mt-1">Span {finding.location.start}–{finding.location.end}</div>
                      ) : null}
                      <div className="row wrap mt-2">
                        <button className="btn btn-accept btn-sm" disabled={pending || finding.status === 'accepted'} onClick={() => mark(finding, 'accepted')}>
                          {pending ? <Spinner size={12} /> : <Check size={12} />} Accept
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={pending || finding.status === 'rejected'} onClick={() => mark(finding, 'rejected')}>
                          <X size={12} /> Reject
                        </button>
                        <button className="btn btn-sm" onClick={() => setOverride(finding)} disabled={pending}>
                          <PencilLine size={12} /> Override…
                        </button>
                        {finding.status !== 'open' ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => mark(finding, 'open')} disabled={pending}>
                            <RotateCcw size={12} /> Reopen
                          </button>
                        ) : null}
                        {finding.category === 'claims' ? (
                          <Badge tone="tone-indigo"><ShieldCheck size={11} /> suggestion, not a blocker</Badge>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="card card-pad">
                <EmptyState
                  icon={ShieldCheck}
                  title={findings.length ? 'No findings match those filters' : 'No issues found'}
                  description={
                    findings.length
                      ? 'Clear a filter to see the other findings.'
                      : 'This content is consistent with the available brand guidance. You can still rewrite it for style, and a human reviewer still approves the workflow.'
                  }
                />
              </div>
            )}

            {!findings.length ? (
              <div className="disclosure row" style={{ gap: 8 }}>
                <AlertTriangle size={14} style={{ color: 'var(--amber)', flex: 'none', marginTop: 2 }} />
                <span>
                  No findings means the active brand knowledge did not flag anything. It is not a guarantee of factual
                  accuracy — only that nothing in your current knowledge base contradicted it.
                </span>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <DecisionModal
        open={Boolean(override)}
        finding={override}
        pending={decide.isPending}
        onClose={() => setOverride(null)}
        onConfirm={(body) => {
          if (!override) return;
          decide.mutate({ id: override.id, submissionId: submission.id, body });
        }}
      />
    </div>
  );
}
