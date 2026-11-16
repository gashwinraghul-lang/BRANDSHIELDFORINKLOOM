// client/src/pages/review/ReviewLayout.jsx
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  RefreshCw,
  Send,
  ShieldAlert,
  Clock,
  FileText,
  Sparkles,
} from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Badge,
  EngineBadge,
  ErrorNotice,
  SeverityBadge,
  SkeletonLines,
  Spinner,
  StatusBadge,
} from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function ReviewLayout() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const query = useQuery({
    queryKey: ['submission', id],
    queryFn: () => endpoints.submission(id),
    refetchInterval: (q) => {
      const status = q.state.data?.submission?.processing_status;
      return ['queued', 'processing'].includes(status) ? 1600 : false;
    },
  });

  const rerun = useMutation({
    mutationFn: () => endpoints.rerunReview(id),
    onSuccess: () => {
      success('Review started again. Findings refresh when it finishes.');
      queryClient.invalidateQueries({ queryKey: ['submission', id] });
    },
    onError: (err) => toastError(err.message || 'Could not restart the review'),
  });

  const submit = useMutation({
    mutationFn: () => endpoints.submitForReview(id, {}),
    onSuccess: () => {
      success('Submitted for review. Reviewers have been notified.');
      queryClient.invalidateQueries({ queryKey: ['submission', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-summary'] });
    },
    onError: (err) => toastError(err.message || 'Could not submit for review'),
  });

  useEffect(() => {
    document.title = query.data?.submission?.title
      ? `${query.data.submission.title} · BrandShield.ai`
      : 'Review · BrandShield.ai';
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="stack">
        <div className="card card-pad"><SkeletonLines lines={2} /></div>
        <div className="grid" style={{ gridTemplateColumns: '1.1fr 0.9fr' }}>
          <div className="card card-pad"><SkeletonLines lines={8} /></div>
          <div className="card card-pad"><SkeletonLines lines={6} /></div>
        </div>
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="stack">
        <Link to="/app/submissions" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} /> Back to submissions
        </Link>
        <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const data = query.data;
  const submission = data.submission;
  const findings = data.findings || [];
  const claims = data.claims || [];
  const processing = ['queued', 'processing'].includes(submission.processing_status);
  const openFindings = findings.filter((finding) => finding.status === 'open').length;
  const canSubmit = ['draft', 'changes_requested'].includes(submission.status);

  return (
    <div className="stack">
      <Link to="/app/submissions" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={14} /> All submissions
      </Link>

      <div className="card card-pad stack-sm">
        <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
          <div className="stack-sm grow" style={{ minWidth: 260 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <StatusBadge status={submission.status} />
              {submission.confidentiality === 'restricted' ? (
                <Badge tone="tone-red"><ShieldAlert size={11} /> Restricted · local only</Badge>
              ) : (
                <Badge>{submission.confidentiality}</Badge>
              )}
              <Badge>{submission.content_type}</Badge>
              <EngineBadge engine={submission.engine} />
            </div>
            <h1 style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.2rem)' }}>{submission.title}</h1>
            <div className="tiny muted row wrap" style={{ gap: 14 }}>
              <span>By {submission.creator_name} · {submission.creator_role}</span>
              <span>Created {formatDateTime(submission.created_at)}</span>
              {submission.assignee_name ? <span>Assigned to {submission.assignee_name}</span> : null}
              {submission.submitted_at ? <span>Submitted {formatDateTime(submission.submitted_at)}</span> : null}
            </div>
          </div>
          <div className="row wrap">
            <button className="btn btn-sm" onClick={() => rerun.mutate()} disabled={rerun.isPending || processing}>
              {rerun.isPending || processing ? <Spinner size={14} /> : <RefreshCw size={14} />} Re-run review
            </button>
            {canSubmit ? (
              <button className="btn btn-primary btn-sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? <Spinner size={14} /> : <Send size={14} />} Submit for review
              </button>
            ) : null}
          </div>
        </div>

        {processing ? (
          <div className="disclosure" style={{ borderColor: 'rgba(95,227,245,0.3)' }}>
            <div className="row">
              <Spinner size={15} />
              <span>
                <strong>Review in progress.</strong> The agents are checking tone, terminology, messaging, claims,
                visual consistency and accessibility. This page updates automatically.
              </span>
            </div>
            <div className="progress-track mt-2">
              <div className="progress-fill" style={{ width: '58%', animation: 'pulse 1.4s ease-in-out infinite' }} />
            </div>
          </div>
        ) : null}

        {submission.processing_status === 'failed' ? (
          <div className="disclosure" style={{ borderColor: 'rgba(255,107,107,0.35)' }}>
            <strong style={{ color: 'var(--red)' }}>The last review run failed.</strong>{' '}
            {submission.processing_error || 'No error detail was recorded.'} You can re-run it safely; your decisions on
            previous findings remain in the audit trail.
          </div>
        ) : null}

        <div className="tabs" style={{ marginTop: 4 }}>
          <NavLink to="." end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            Findings <span className="muted tiny" style={{ marginLeft: 6 }}>{findings.length}</span>
          </NavLink>
          <NavLink to="claims" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <QuoteIcon /> Claims <span className="muted tiny" style={{ marginLeft: 6 }}>{claims.length}</span>
          </NavLink>
          <NavLink to="approval" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            Approval workflow
          </NavLink>
          <div className="grow" />
          <span className="tiny muted row" style={{ gap: 6, paddingRight: 4 }}>
            <Clock size={12} /> {openFindings} open
          </span>
        </div>
      </div>

      <Outlet context={{ ...data, findings, claims, refetch: query.refetch, isFetching: query.isFetching }} />
    </div>
  );
}

function QuoteIcon() {
  return <Sparkles size={13} style={{ verticalAlign: -2 }} />;
}
