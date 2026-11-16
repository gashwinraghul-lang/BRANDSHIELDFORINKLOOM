// client/src/pages/NewReview.jsx
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileUp, Send, Sparkles, ShieldAlert, Info } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { PageHeader, Field, DisclosurePanel, Spinner, Badge } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { categoryLabel } from '../lib/format.js';

const MAX_BYTES = 15 * 1024 * 1024;

export default function NewReview() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('upload') ? 'upload' : 'paste');
  const [form, setForm] = useState({
    title: '',
    content: '',
    purpose: '',
    confidentiality: 'internal',
    assignedTo: '',
  });
  const [file, setFile] = useState(null);
  const [useAgent, setUseAgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const team = useQuery({ queryKey: ['me'], queryFn: endpoints.me });
  const teamList = useQuery({ queryKey: ['team'], queryFn: endpoints.team });
  const canAssign = ['admin', 'manager'].includes(team.data?.user?.role);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function pickFile(selected) {
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setError('That file is larger than 15 MB. Split it or compress it first.');
      return;
    }
    setError('');
    setFile(selected);
    if (!form.title) update('title', selected.name.replace(/\.[^.]+$/, '').slice(0, 120));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let submission;
      if (mode === 'upload') {
        if (!file) throw new Error('Choose a document or image to review.');
        const payload = new FormData();
        payload.append('file', file);
        payload.append('title', form.title.trim());
        payload.append('confidentiality', form.confidentiality);
        if (form.purpose.trim()) payload.append('purpose', form.purpose.trim());
        const result = await endpoints.uploadSubmission(payload);
        submission = result.submission;
      } else if (useAgent) {
        const result = await endpoints.viaAgent({
          title: form.title.trim(),
          content: form.content,
          confidentiality: form.confidentiality,
        });
        submission = result.submission;
      } else {
        const body = {
          title: form.title.trim(),
          content: form.content,
          confidentiality: form.confidentiality,
          purpose: form.purpose.trim() || null,
        };
        if (form.assignedTo) body.assignedTo = Number(form.assignedTo);
        const result = await endpoints.createSubmission(body);
        submission = result.submission;
      }
      success('Review started. Findings will appear as the agents finish.');
      navigate(`/app/reviews/${submission.id}`);
    } catch (err) {
      setError(err.message || 'Could not start the review.');
      toastError(err.message || 'Could not start the review.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = mode === 'upload' ? Boolean(file) : form.content.trim().length > 0;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="New review"
        title="Submit content before it goes live."
        description="Text, documents and images are reviewed against active guidelines, approved facts, terminology and brand assets. Nothing is published or changed automatically."
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.75fr)', alignItems: 'start' }}>
        <form className="card card-pad stack" onSubmit={handleSubmit}>
          <div className="tabs" style={{ marginBottom: -4 }}>
            <button type="button" className={`tab ${mode === 'paste' ? 'active' : ''}`} onClick={() => setMode('paste')}>Paste text</button>
            <button type="button" className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>Upload file or image</button>
          </div>

          <Field label="Title" htmlFor="review-title" hint="Something your team will recognise in the review queue.">
            <input
              id="review-title"
              className="input"
              required
              minLength={3}
              maxLength={120}
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Q3 launch announcement — LinkedIn"
            />
          </Field>

          {mode === 'paste' ? (
            <Field
              label="Content"
              htmlFor="review-content"
              hint={`${form.content.trim() ? form.content.trim().split(/\s+/).length : 0} words. Everything you paste is treated as untrusted data, never as instructions to the AI.`}
            >
              <textarea
                id="review-content"
                className="textarea"
                required
                value={form.content}
                onChange={(e) => update('content', e.target.value)}
                placeholder="Paste the draft copy exactly as it will appear…"
                style={{ minHeight: 260 }}
              />
            </Field>
          ) : (
            <div className="stack-sm">
              <div
                className="panel"
                style={{
                  padding: 26,
                  textAlign: 'center',
                  borderStyle: 'dashed',
                  cursor: 'pointer',
                  borderColor: file ? 'rgba(95,227,245,0.5)' : undefined,
                }}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
              >
                <FileUp size={26} style={{ color: 'var(--cyan)' }} />
                <div className="mt-2" style={{ fontWeight: 600 }}>{file ? file.name : 'Drop a file here, or click to browse'}</div>
                <div className="tiny muted mt-1">
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB · ready to review`
                    : 'PDF, DOCX, TXT, MD, HTML, CSV, PNG, JPG or WEBP · up to 15 MB'}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.svg"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </div>
              {file ? (
                <div className="row wrap">
                  <Badge tone="tone-green">Selected</Badge>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}>
                    Remove file
                  </button>
                </div>
              ) : null}
              <p className="tiny muted">
                Images are checked for palette compliance, WCAG contrast and logo verification. Scanned documents use
                local OCR; extraction can miss unusual layouts.
              </p>
            </div>
          )}

          <div className="grid grid-2">
            <Field label="Purpose" htmlFor="review-purpose" hint="Optional. Helps the rewrite keep your intent.">
              <input
                id="review-purpose"
                className="input"
                value={form.purpose}
                onChange={(e) => update('purpose', e.target.value)}
                placeholder="Announce the Q3 product launch"
              />
            </Field>
            <Field label="Confidentiality" htmlFor="review-confidentiality">
              <select
                id="review-confidentiality"
                className="select"
                value={form.confidentiality}
                onChange={(e) => update('confidentiality', e.target.value)}
              >
                <option value="public">Public — safe for external services</option>
                <option value="internal">Internal — default</option>
                <option value="restricted">Restricted — local review only</option>
              </select>
            </Field>
          </div>

          {canAssign && mode !== 'upload' ? (
            <Field label="Assign reviewer" htmlFor="review-assign" hint="Optional. Managers and admins can assign after submission too.">
              <select id="review-assign" className="select" value={form.assignedTo} onChange={(e) => update('assignedTo', e.target.value)}>
                <option value="">No one yet</option>
                {(teamList.data?.users || [])
                  .filter((member) => ['admin', 'manager', 'reviewer'].includes(member.role))
                  .map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email} · {member.role}</option>
                  ))}
              </select>
            </Field>
          ) : null}

          {mode === 'paste' ? (
            <label className="checkbox">
              <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
              <span>
                <strong>Review with the BrandShield Agentverse agent.</strong> Sends the text through the configured
                Agentverse bridge when it is online. If it is offline the direct review runs automatically, so you always
                get a normal finding set. Restricted submissions are reviewed locally either way.
              </span>
            </label>
          ) : null}

          {form.confidentiality === 'restricted' ? (
            <div className="disclosure" style={{ borderColor: 'rgba(255,107,107,0.3)' }}>
              <strong style={{ color: 'var(--red)' }}><ShieldAlert size={13} style={{ verticalAlign: -2 }} /> Restricted review.</strong>{' '}
              This submission and any restricted knowledge it touches will stay on this server. Language-model and
              Agentverse calls are skipped; deterministic engines handle the review.
            </div>
          ) : null}

          {error ? <div className="error-text">{error}</div> : null}

          <div className="row-between wrap">
            <span className="tiny muted row" style={{ gap: 6 }}>
              <Info size={13} /> Findings are suggestions. You decide on every one.
            </span>
            <button className="btn btn-primary btn-lg" type="submit" disabled={submitting || !canSubmit}>
              {submitting ? <Spinner size={16} /> : useAgent && mode === 'paste' ? <Sparkles size={16} /> : <Send size={16} />}
              {submitting ? 'Starting review…' : useAgent && mode === 'paste' ? 'Review via agent' : 'Start review'}
            </button>
          </div>
        </form>

        <div className="stack">
          <section className="card card-pad">
            <h3 className="mb-2">What gets checked</h3>
            <div className="stack-sm">
              {[
                ['tone', 'Tone and voice against the active guidelines'],
                ['terminology', 'Banned terms and preferred alternatives'],
                ['messaging', 'Value propositions and required messages'],
                ['claims', 'Factual and promotional claims against approved facts'],
                ['visual', 'Palette, logo and contrast for image submissions'],
                ['accessibility', 'Readability, alt text and WCAG contrast'],
              ].map(([key, label]) => (
                <div key={key} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="badge-dot" style={{ background: 'var(--cyan)', marginTop: 7 }} />
                  <div>
                    <div className="tiny" style={{ color: 'var(--text)', fontWeight: 600 }}>{categoryLabel[key]}</div>
                    <div className="tiny muted">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <DisclosurePanel />
        </div>
      </div>
    </div>
  );
}
