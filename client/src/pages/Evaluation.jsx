// client/src/pages/Evaluation.jsx
import { useQuery } from '@tanstack/react-query';
import { FlaskConical, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { Badge, EmptyState, ErrorNotice, PageHeader, SkeletonLines } from '../components/ui.jsx';
import { formatDateTime, percent } from '../lib/format.js';

function MetricCards({ run }) {
  if (!run || typeof run !== 'object') return null;
  const entries = Object.entries(run).filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value)
  );
  if (!entries.length) return null;
  return (
    <div className="grid grid-3" style={{ gap: 10 }}>
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key} className="panel card-pad">
          <div className="stat-label">{key.replace(/([A-Z])/g, ' $1')}</div>
          <div className="stat-value" style={{ fontSize: '1.45rem' }}>
            {typeof value === 'number' && /rate|accuracy|precision|recall|f1$/i.test(key) ? percent(value) : String(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfusionTable({ matrix }) {
  if (!matrix || typeof matrix !== 'object') return null;
  const rows = Object.entries(matrix);
  if (!rows.length) return null;
  const labels = [...new Set(rows.flatMap(([, value]) => (value && typeof value === 'object' ? Object.keys(value) : [])))];
  if (!labels.length) return null;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Actual ↓ / predicted →</th>{labels.map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([actual, values]) => (
            <tr key={actual}>
              <td className="tiny" style={{ fontWeight: 600 }}>{actual}</td>
              {labels.map((label) => (
                <td key={label} className="tiny">{values?.[label] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureList({ failures }) {
  if (!Array.isArray(failures) || !failures.length) return null;
  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 6 }}>
        <AlertTriangle size={13} style={{ color: 'var(--amber)' }} />
        <span className="tiny" style={{ fontWeight: 600 }}>Reported failures ({failures.length})</span>
      </div>
      {failures.slice(0, 8).map((failure, index) => (
        <pre key={index} className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(4,10,18,0.6)', padding: 10, borderRadius: 8 }}>
          {typeof failure === 'string' ? failure : JSON.stringify(failure, null, 2)}
        </pre>
      ))}
    </div>
  );
}

export default function Evaluation() {
  const latest = useQuery({ queryKey: ['evaluation'], queryFn: endpoints.evaluation });
  const runs = useQuery({ queryKey: ['eval-runs'], queryFn: () => endpoints.evalRuns() });

  const kinds = Object.entries(latest.data?.latest || {});

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Quality"
        title="Evaluation"
        description="Honest accuracy numbers for the claim engine and the image engine. Failures are listed, not hidden."
        actions={
          <div className="row wrap">
            <span className="badge mono">npm run eval:claims</span>
            <span className="badge mono">npm run eval:images</span>
          </div>
        }
      />

      {latest.error ? <ErrorNotice error={latest.error} onRetry={() => latest.refetch()} /> : null}

      {latest.isLoading ? <div className="card card-pad"><SkeletonLines lines={5} /></div> : kinds.length ? (
        <div className="stack">
          {kinds.map(([kind, run]) => (
            <section key={kind} className="card card-pad stack-sm">
              <div className="row-between wrap">
                <div className="row" style={{ gap: 8 }}>
                  <FlaskConical size={16} style={{ color: 'var(--cyan)' }} />
                  <h3 style={{ textTransform: 'capitalize' }}>{kind} evaluation</h3>
                  <Badge tone={run?.passed === false ? 'tone-red' : 'tone-green'}>
                    {run?.passed === false ? 'has failures' : 'latest run'}
                  </Badge>
                </div>
                <span className="tiny muted">{run?.created_at ? formatDateTime(run.created_at) : ''}</span>
              </div>
              <MetricCards run={run} />
              {run?.confusionMatrix ? (
                <div className="stack-sm">
                  <span className="tiny" style={{ fontWeight: 600 }}>Confusion matrix</span>
                  <ConfusionTable matrix={run.confusionMatrix} />
                </div>
              ) : null}
              {run?.perVerdict || run?.perClass ? (
                <div className="stack-sm">
                  <span className="tiny" style={{ fontWeight: 600 }}>Per class</span>
                  <pre className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', background: 'rgba(4,10,18,0.55)', padding: 12, borderRadius: 8 }}>
                    {JSON.stringify(run.perVerdict || run.perClass, null, 2)}
                  </pre>
                </div>
              ) : null}
              <FailureList failures={run?.failures || run?.failureCases} />
            </section>
          ))}
        </div>
      ) : (
        <div className="card card-pad">
          <EmptyState
            icon={FlaskConical}
            title="No evaluation runs yet"
            description="Run the labelled claim and image evaluations from the server folder. Results are stored in eval_runs and shown here with their failures."
            action={<div className="row wrap"><span className="badge mono">cd server</span><span className="badge mono">npm run eval:claims</span></div>}
          />
        </div>
      )}

      <section className="card card-pad stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
          <h3>Run history</h3>
        </div>
        {runs.isLoading ? <SkeletonLines lines={3} /> : (runs.data?.runs || []).length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kind</th><th>When</th><th>Engine</th><th>Summary</th></tr></thead>
              <tbody>
                {(runs.data.runs || []).map((run) => (
                  <tr key={run.id}>
                    <td className="tiny" style={{ textTransform: 'capitalize' }}>{run.kind}</td>
                    <td className="tiny muted">{formatDateTime(run.created_at)}</td>
                    <td className="tiny">{run.engine || run.details?.engine || '—'}</td>
                    <td className="tiny muted truncate" style={{ maxWidth: 420 }}>
                      {run.details ? JSON.stringify(run.details).slice(0, 160) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tiny muted">No runs recorded yet.</p>
        )}
        <div className="disclosure tiny">
          {latest.data?.note || 'Evaluation labels are never tuned to inflate scores. If an engine fails, the failure is reported here.'}
        </div>
      </section>
    </div>
  );
}
