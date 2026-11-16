// client/src/pages/review/ReviewApproval.jsx
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  UserCheck,
  MessageSquare,
  Check,
  X,
  RotateCcw,
  History,
  GitCompare,
  Clock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Badge, EmptyState, Field, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime, parseDiff, statusLabel, statusTone } from '../../lib/format.js';

const DECISIONS = [
  { value: 'approved', label: 'Approve', icon: Check, className: 'btn-accept' },
  { value: 'changes_requested', label: 'Request changes', icon: RotateCcw, className: '' },
  { value: 'rejected', label: 'Reject', icon: X, className: 'btn-danger' },
];

export default function ReviewApproval() {
  const { submission, comments, revisions, approvals, refetch } = useOutletContext();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState(submission.assigned_to || '');
  const [comment, setComment] = useState('');
  const [compareIndex, setCompareIndex] = useState(null);

  const team = useQuery({ queryKey: ['team'], queryFn: endpoints.team });
  const canReview = ['admin', 'manager', 'reviewer'].includes(user?.role);
  const canAssign = ['admin', 'manager'].includes(user?.role);
  const canSubmit = ['draft', 'changes_requested'].includes(submission.status);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['submission', String(submission.id)] });
    queryClient.invalidateQueries({ queryKey: ['workflow-summary'] });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
    refetch();
  }

  const sendForReview = useMutation({
    mutationFn: () => endpoints.submitForReview(submission.id, { note: note.trim() || undefined }),
    onSuccess: () => {
      success('Submitted for review.');
      setNote('');
      refresh();
    },
    onError: (err) => toastError(err.message || 'Could not submit for review'),
  });

  const assignMutation = useMutation({
    mutationFn: () => endpoints.assign(submission.id, Number(assignee)),
    onSuccess: () => {
      success('Reviewer assigned.');
      refresh();
    },
    onError: (err) => toastError(err.message || 'Could not assign that reviewer'),
  });

  const decisionMutation = useMutation({
    mutationFn: (decision) => endpoints.decision(submission.id, { decision, note: note.trim() || null }),
    onSuccess: (data, decision) => {
      success(`Decision recorded: ${statusLabel[decision] || decision}.`);
      setNote('');
      refresh();
    },
    onError: (err) => toastError(err.message || 'Could not record that decision'),
  });

  const commentMutation = useMutation({
    mutationFn: (body) => endpoints.addComment(submission.id, { body }),
    onSuccess: () => {
      success('Comment added.');
      setComment('');
      refresh();
    },
    onError: (err) => toastError(err.message || 'Could not add that comment'),
  });

  function decide(decision) {
    if (['changes_requested', 'rejected'].includes(decision) && !note.trim()) {
      toastError('Add a note explaining what needs to change.');
      return;
    }
    decisionMutation.mutate(decision);
  }

  const selectedRevision = compareIndex != null ? revisions[compareIndex] : null;
  const previousRevision = compareIndex != null ? revisions[compareIndex + 1] : null;
  const diffRows =
    selectedRevision && previousRevision ? parseDiff(previousRevision.content || '', selectedRevision.content || '') : [];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)', alignItems: 'start' }}>
      <div className="stack">
        <section className="card card-pad stack-sm">
          <div className="row-between wrap">
            <div className="row" style={{ gap: 8 }}>
              <ShieldCheck size={17} style={{ color: 'var(--green)' }} />
              <h3>Approval workflow</h3>
              <StatusBadge status={submission.status} />
            </div>
            <span className="tiny muted">Current revision {submission.current_revision}</span>
          </div>

          {canSubmit ? (
            <div className="stack-sm">
              <p className="tiny">
                This submission is a <strong>{statusLabel[submission.status]?.toLowerCase()}</strong>. Submit it to the
                review queue so a reviewer, manager or admin can make the final decision.
              </p>
              <Field label="Note for reviewers" htmlFor="submit-note" hint="Optional context for the reviewer.">
                <textarea
                  id="submit-note"
                  className="textarea"
                  style={{ minHeight: 70 }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Addresses the previous change request. The 20% figure is now sourced."
                />
              </Field>
              <button className="btn btn-primary" onClick={() => sendForReview.mutate()} disabled={sendForReview.isPending} style={{ alignSelf: 'flex-start' }}>
                {sendForReview.isPending ? <Spinner size={14} /> : <Send size={14} />} Submit for review
              </button>
            </div>
          ) : submission.status === 'in_review' ? (
            <div className="stack-sm">
              <p className="tiny">
                A decision is required. Every decision is recorded in the audit log and the author is notified. A note is
                required when requesting changes or rejecting.
              </p>
              <Field label="Decision note" htmlFor="decision-note" hint="Required for “request changes” and “reject”.">
                <textarea
                  id="decision-note"
                  className="textarea"
                  style={{ minHeight: 82 }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this decision? Cite the finding or the fix that is still needed."
                />
              </Field>
              {!canReview ? (
                <div className="disclosure tiny">
                  Your role is <strong>{user?.role}</strong>. Only reviewers, managers and admins can approve, request
                  changes or reject. You can still comment below.
                </div>
              ) : (
                <div className="row wrap">
                  {DECISIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`btn ${option.className}`}
                      disabled={decisionMutation.isPending}
                      onClick={() => decide(option.value)}
                    >
                      {decisionMutation.isPending && decisionMutation.variables === option.value ? <Spinner size={13} /> : <option.icon size={13} />}
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="disclosure">
              This submission is <strong>{statusLabel[submission.status]?.toLowerCase() || submission.status}</strong>
              {submission.decided_at ? ` (decided ${formatDateTime(submission.decided_at)})` : ''}. To revise it, the
              author can edit the content — that creates a new revision and re-runs the review.
            </div>
          )}

          {canAssign ? (
            <>
              <div className="divider" />
              <div className="row wrap">
                <Users size={15} style={{ color: 'var(--cyan)' }} />
                <span className="tiny" style={{ fontWeight: 600 }}>Assign reviewer</span>
                <select className="select" style={{ width: 230 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign reviewer">
                  <option value="">Choose a team member</option>
                  {(team.data?.users || [])
                    .filter((member) => ['admin', 'manager', 'reviewer'].includes(member.role))
                    .map((member) => (
                      <option key={member.id} value={member.id}>{member.name || member.email} · {member.role}</option>
                    ))}
                </select>
                <button className="btn btn-sm" onClick={() => assignee && assignMutation.mutate()} disabled={!assignee || assignMutation.isPending}>
                  {assignMutation.isPending ? <Spinner size={13} /> : <UserCheck size={13} />} Assign
                </button>
                {submission.assignee_name ? <span className="tiny muted">Currently {submission.assignee_name}</span> : null}
              </div>
            </>
          ) : null}
        </section>

        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <MessageSquare size={16} style={{ color: 'var(--cyan)' }} />
            <h3>Discussion</h3>
            <Badge>{comments.length}</Badge>
          </div>
          <p className="tiny muted">
            Use @mentions with an email handle, for example <span className="mono">@reviewer</span>, to notify a teammate.
          </p>
          {comments.length ? (
            <div>
              {comments.map((entry) => (
                <div key={entry.id} className={`comment ${entry.parent_id ? 'reply' : ''}`}>
                  <div className="row-between wrap">
                    <div className="row" style={{ gap: 8 }}>
                      <strong className="tiny">{entry.author_name || entry.author_email || 'Unknown'}</strong>
                      <Badge>{entry.author_role || 'member'}</Badge>
                    </div>
                    <span className="tiny muted">{formatDateTime(entry.created_at)}</span>
                  </div>
                  <p className="tiny mt-1" style={{ whiteSpace: 'pre-wrap' }}>{entry.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={MessageSquare} title="No comments yet" description="Ask a question, cite a guideline, or leave context for the next reviewer." />
          )}
          <Field label="Add a comment" htmlFor="new-comment">
            <textarea
              id="new-comment"
              className="textarea"
              style={{ minHeight: 78 }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="The claim in paragraph two is now sourced. @reviewer can you confirm?"
            />
          </Field>
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={commentMutation.isPending || !comment.trim()}
            onClick={() => commentMutation.mutate(comment.trim())}
          >
            {commentMutation.isPending ? <Spinner size={14} /> : <Send size={14} />} Post comment
          </button>
        </section>

        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <History size={16} style={{ color: 'var(--lilac)' }} />
            <h3>Revision history</h3>
            <Badge>{revisions.length}</Badge>
          </div>
          {revisions.length ? (
            <div className="stack-sm">
              {revisions.map((revision, index) => (
                <div key={revision.id} className="kb-item">
                  <div className="row-between wrap">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="version-pill">v{revision.version}</span>
                      <span className="tiny">{revision.author_name || 'Unknown'}</span>
                      <span className="tiny muted">{formatDateTime(revision.created_at)}</span>
                      {index === 0 ? <Badge tone="tone-green">current</Badge> : null}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={index === revisions.length - 1}
                      title={index === revisions.length - 1 ? 'This is the first revision' : 'Compare with the previous revision'}
                      onClick={() => setCompareIndex(compareIndex === index ? null : index)}
                    >
                      <GitCompare size={13} /> {compareIndex === index ? 'Hide diff' : 'Compare'}
                    </button>
                  </div>
                  <div className="tiny muted mt-1">{revision.note || 'No change note'}</div>
                  {compareIndex === index ? (
                    <div className="diff mt-2">
                      <div>
                        <div className="tiny muted mb-1">Before · v{previousRevision?.version}</div>
                        <pre>{diffRows.map((row, i) => (row.changed ? <span key={i} className="removed">{row.before || ' '}</span> : null))}</pre>
                      </div>
                      <div>
                        <div className="tiny muted mb-1">After · v{revision.version}</div>
                        <pre>{diffRows.map((row, i) => (row.changed ? <span key={i} className="added">{row.after || ' '}</span> : null))}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={GitCompare} title="No revisions recorded" description="Revisions are created when content is edited or a rewrite is applied." />
          )}
        </section>
      </div>

      <div className="stack" style={{ position: 'sticky', top: 78 }}>
        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <Clock size={16} style={{ color: 'var(--cyan)' }} />
            <h3>Status timeline</h3>
          </div>
          <ol className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            <TimelineItem
              title="Created as draft"
              detail={`${submission.creator_name} · ${formatDateTime(submission.created_at)}`}
              tone="var(--muted)"
            />
            {submission.submitted_at ? (
              <TimelineItem
                title="Submitted for review"
                detail={formatDateTime(submission.submitted_at)}
                tone="var(--indigo-2)"
              />
            ) : null}
            {(approvals || []).slice().reverse().map((approval) => (
              <TimelineItem
                key={approval.id}
                title={`Decision: ${statusLabel[approval.decision] || approval.decision}`}
                detail={`${approval.reviewer_name} · ${formatDateTime(approval.created_at)}${approval.note ? ` — ${approval.note}` : ''}`}
                tone={approval.decision === 'approved' ? 'var(--green)' : approval.decision === 'rejected' ? 'var(--red)' : 'var(--amber)'}
              />
            ))}
            {!submission.decided_at && submission.status === 'in_review' ? (
              <TimelineItem title="Awaiting a decision" detail="A reviewer, manager or admin decides." tone="var(--amber)" />
            ) : null}
          </ol>
          <div className="divider" />
          <div className="row-between">
            <span className="tiny muted">Current status</span>
            <span className={`badge ${statusTone[submission.status] || ''}`}>{statusLabel[submission.status] || submission.status}</span>
          </div>
        </section>

        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <Clock size={16} style={{ color: 'var(--amber)' }} />
            <h3>Recent decisions</h3>
          </div>
          {(approvals || []).length ? (
            approvals.slice(0, 4).map((approval) => (
              <div key={approval.id} className="tiny">
                <div className="row-between">
                  <strong style={{ color: 'var(--text)' }}>{approval.reviewer_name}</strong>
                  <Badge tone={approval.decision === 'approved' ? 'tone-green' : approval.decision === 'rejected' ? 'tone-red' : 'tone-amber'}>
                    {statusLabel[approval.decision] || approval.decision}
                  </Badge>
                </div>
                {approval.note ? <div className="muted mt-1">“{approval.note}”</div> : null}
                <div className="muted">{formatDateTime(approval.created_at)}</div>
              </div>
            ))
          ) : (
            <p className="tiny muted">No approval decisions yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function TimelineItem({ title, detail, tone }) {
  return (
    <li className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
      <span className="badge-dot" style={{ background: tone || 'var(--cyan)', marginTop: 6, flex: 'none' }} />
      <div>
        <div className="tiny" style={{ color: 'var(--text)', fontWeight: 600 }}>{title}</div>
        <div className="tiny muted">{detail}</div>
      </div>
    </li>
  );
}
