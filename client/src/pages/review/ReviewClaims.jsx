// client/src/pages/review/ReviewClaims.jsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Quote,
  ShieldCheck,
  ShieldAlert,
  CalendarClock,
  User,
  Link2,
  Plus,
  Check,
  X,
  PencilLine,
  Search,
} from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import DecisionModal from '../../components/DecisionModal.jsx';
import {
  Badge,
  EmptyState,
  EngineBadge,
  Field,
  Modal,
  Spinner,
} from '../../components/ui.jsx';
import { formatDate, percent, verdictTone } from '../../lib/format.js';

const VERDICT_LABEL = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  outdated: 'Outdated fact',
  unsupported: 'No source',
};

const VERDICT_HELP = {
  supported: 'An approved fact with a live expiry date supports this claim.',
  contradicted: 'Approved knowledge states something different — often a near-miss number or a negation.',
  outdated: 'A matching approved fact exists but has passed its expiry date.',
  unsupported: 'Nothing in the approved facts supports this claim. It is a suggestion, not an error.',
};

export default function ReviewClaims() {
  const { submission, claims: embeddedClaims, refetch } = useOutletContext();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [addFactFor, setAddFactFor] = useState(null);
  const [override, setOverride] = useState(null);
  const [factForm, setFactForm] = useState({ statement: '', source: '', owner: '', expiresAt: '', tags: 'from-claim-review' });

  const claimsQuery = useQuery({
    queryKey: ['claims', submission.id],
    queryFn: () => endpoints.claims(submission.id),
  });
  const claims = claimsQuery.data?.claims || embeddedClaims || [];
  const canManageFacts = ['admin', 'manager', 'reviewer'].includes(user?.role);

  const counts = useMemo(() => {
    const base = { supported: 0, contradicted: 0, outdated: 0, unsupported: 0 };
    for (const claim of claims) base[claim.verdict] = (base[claim.verdict] || 0) + 1;
    return base;
  }, [claims]);

  const decide = useMutation({
    mutationFn: ({ id, body }) => endpoints.decideFinding(id, body),
    onSuccess: () => {
      success('Claim finding updated.');
      queryClient.invalidateQueries({ queryKey: ['submission', String(submission.id)] });
      queryClient.invalidateQueries({ queryKey: ['claims', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setOverride(null);
      refetch();
    },
    onError: (err) => toastError(err.message || 'Could not save that decision'),
  });

  const addFact = useMutation({
    mutationFn: ({ id, body }) => endpoints.addFactFromClaim(id, body),
    onSuccess: () => {
      success('Added to approved facts. Future reviews can cite it.');
      setAddFactFor(null);
      queryClient.invalidateQueries({ queryKey: ['claims', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submission', String(submission.id)] });
      queryClient.invalidateQueries({ queryKey: ['facts'] });
      queryClient.invalidateQueries({ queryKey: ['unsourced-claims'] });
    },
    onError: (err) => toastError(err.message || 'Could not add that fact'),
  });

  function openAddFact(claim) {
    setAddFactFor(claim);
    setFactForm({
      statement: claim.matchedFact?.statement || claim.claim_text,
      source: claim.source || claim.matchedFact?.source || '',
      owner: claim.owner || claim.matchedFact?.owner || '',
      expiresAt: '',
      tags: 'from-claim-review',
    });
  }

  if (claimsQuery.isLoading && !claims.length) {
    return <div className="card card-pad"><Spinner /></div>;
  }

  if (!claims.length) {
    return (
      <div className="card card-pad">
        <EmptyState
          icon={Search}
          title="No claims were extracted"
          description="The claim agent looks for numbers, superlatives, guarantees, certifications, percentages and dates. Short copy may contain none. Re-run the review if you changed the content."
          action={
            <button className="btn btn-sm" onClick={() => refetch()}>
              Refresh
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="grid grid-4">
        {Object.entries(VERDICT_LABEL).map(([verdict, label]) => (
          <div key={verdict} className="card card-pad stat">
            <div className="row-between">
              <span className="stat-label">{label}</span>
              <span className={`badge ${verdictTone[verdict] || ''}`} style={{ padding: '2px 7px' }}>
                {verdict === 'supported' ? <ShieldCheck size={12} /> : verdict === 'unsupported' ? <Quote size={12} /> : <ShieldAlert size={12} />}
              </span>
            </div>
            <div className="stat-value">{counts[verdict] || 0}</div>
            <div className="stat-note">{VERDICT_HELP[verdict]}</div>
          </div>
        ))}
      </div>

      <div className="disclosure">
        <strong>Evidence, not verdicts.</strong> Every claim below shows the approved fact it was compared with, the
        source, owner and expiry, the similarity score and the engine that produced it. Unsupported claims are
        suggestions and never block submission. Overriding a claim requires a reason.
      </div>

      <div className="stack-sm">
        {claims.map((claim) => {
          const fact = claim.matchedFact;
          const tone = verdictTone[claim.verdict] || '';
          const decided = claim.finding_status && claim.finding_status !== 'open';
          const pending = decide.isPending && decide.variables?.id === claim.finding_id;
          return (
            <article key={claim.id} className="card card-pad stack-sm">
              <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start', maxWidth: 760 }}>
                  <Quote size={18} style={{ color: 'var(--cyan)', flex: 'none', marginTop: 3 }} />
                  <div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: '1.08rem', color: '#fff', lineHeight: 1.4 }}>
                      “{claim.claim_text}”
                    </div>
                    <div className="tiny muted mt-1">{VERDICT_HELP[claim.verdict]}</div>
                  </div>
                </div>
                <div className="row wrap">
                  <Badge tone={tone}>{VERDICT_LABEL[claim.verdict] || claim.verdict}</Badge>
                  <EngineBadge engine={claim.engine} />
                  {claim.finding_status && claim.finding_status !== 'open' ? (
                    <Badge tone={claim.finding_status === 'accepted' ? 'tone-green' : claim.finding_status === 'rejected' ? 'tone-red' : 'tone-indigo'}>
                      {claim.finding_status}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="evidence">
                <div className="row-between wrap">
                  <strong className="tiny row" style={{ gap: 6 }}>
                    <Link2 size={13} /> Evidence {fact ? 'matched' : 'unavailable'}
                  </strong>
                  {claim.similarity != null ? <span className="tiny muted">Similarity {percent(claim.similarity)}</span> : null}
                </div>
                {fact ? (
                  <dl className="evidence-grid">
                    <dt className="tiny">Approved fact</dt>
                    <dd className="tiny">{fact.statement}</dd>
                    <dt className="tiny">Source</dt>
                    <dd className="tiny">{fact.source || '—'}</dd>
                    <dt className="tiny">Owner</dt>
                    <dd className="tiny row" style={{ gap: 5 }}><User size={11} /> {fact.owner || '—'}</dd>
                    <dt className="tiny">Expires</dt>
                    <dd className="tiny row" style={{ gap: 5 }}>
                      <CalendarClock size={11} /> {fact.expires_at ? formatDate(fact.expires_at) : 'No expiry'}
                    </dd>
                    <dt className="tiny">Confidentiality</dt>
                    <dd className="tiny">{fact.confidentiality || 'internal'}</dd>
                    {claim.detail ? (
                      <>
                        <dt className="tiny">Detail</dt>
                        <dd className="tiny">{claim.detail}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : (
                  <p className="tiny muted mt-1">
                    No approved fact matched this claim. If it is accurate, add it to the knowledge base so future
                    reviews can cite it — or reword the claim to remove the unsupported number or superlative.
                  </p>
                )}
              </div>

              <div className="row wrap">
                {claim.finding_id ? (
                  <>
                    <button
                      className="btn btn-accept btn-sm"
                      disabled={pending || claim.finding_status === 'accepted'}
                      onClick={() => decide.mutate({ id: claim.finding_id, body: { status: 'accepted' } })}
                    >
                      {pending ? <Spinner size={12} /> : <Check size={12} />} Accept suggestion
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={pending || claim.finding_status === 'rejected'}
                      onClick={() => decide.mutate({ id: claim.finding_id, body: { status: 'rejected' } })}
                    >
                      <X size={12} /> Reject
                    </button>
                    <button className="btn btn-sm" onClick={() => setOverride({ ...claim, id: claim.finding_id, title: claim.claim_text })} disabled={pending}>
                      <PencilLine size={12} /> Override with reason…
                    </button>
                  </>
                ) : (
                  <span className="tiny muted">No linked finding to decide on.</span>
                )}
                {canManageFacts ? (
                  <button className="btn btn-sm" onClick={() => openAddFact(claim)} style={{ marginLeft: 'auto' }}>
                    <Plus size={12} /> Add to approved facts
                  </button>
                ) : null}
                {decided && claim.finding_status ? <Badge>{claim.finding_status}</Badge> : null}
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={Boolean(addFactFor)}
        onClose={() => setAddFactFor(null)}
        title="Add this claim to approved facts"
        subtitle="Only add statements your organisation can stand behind. The source and owner are shown in future evidence cards."
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAddFactFor(null)} type="button">Cancel</button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={addFact.isPending || factForm.statement.trim().length < 5}
              onClick={() =>
                addFact.mutate({
                  id: addFactFor.id,
                  body: {
                    statement: factForm.statement.trim(),
                    source: factForm.source.trim() || null,
                    owner: factForm.owner.trim() || null,
                    expiresAt: factForm.expiresAt || null,
                    tags: factForm.tags.trim() || null,
                  },
                })
              }
            >
              {addFact.isPending ? 'Adding…' : 'Add approved fact'}
            </button>
          </>
        }
      >
        <div className="stack-sm">
          <Field label="Approved statement" htmlFor="fact-statement">
            <textarea
              id="fact-statement"
              className="textarea"
              style={{ minHeight: 84 }}
              value={factForm.statement}
              onChange={(e) => setFactForm((f) => ({ ...f, statement: e.target.value }))}
            />
          </Field>
          <div className="grid grid-2">
            <Field label="Source" htmlFor="fact-source">
              <input id="fact-source" className="input" value={factForm.source} onChange={(e) => setFactForm((f) => ({ ...f, source: e.target.value }))} placeholder="Legal review, 2026" />
            </Field>
            <Field label="Owner" htmlFor="fact-owner">
              <input id="fact-owner" className="input" value={factForm.owner} onChange={(e) => setFactForm((f) => ({ ...f, owner: e.target.value }))} placeholder="Brand team" />
            </Field>
          </div>
          <div className="grid grid-2">
            <Field label="Expires" htmlFor="fact-expiry" hint="Leave blank if it does not expire.">
              <input id="fact-expiry" className="input" type="date" value={factForm.expiresAt} onChange={(e) => setFactForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </Field>
            <Field label="Tags" htmlFor="fact-tags">
              <input id="fact-tags" className="input" value={factForm.tags} onChange={(e) => setFactForm((f) => ({ ...f, tags: e.target.value }))} />
            </Field>
          </div>
          <div className="tiny muted">
            Added as <strong>internal</strong> confidentiality. Change it in Brand knowledge if the source is restricted.
          </div>
        </div>
      </Modal>

      <DecisionModal
        open={Boolean(override)}
        finding={override}
        pending={decide.isPending}
        onClose={() => setOverride(null)}
        onConfirm={(body) => decide.mutate({ id: override.id, body })}
      />
    </div>
  );
}
