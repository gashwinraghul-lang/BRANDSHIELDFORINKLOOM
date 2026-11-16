// client/src/pages/Knowledge.jsx
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  Quote,
  Palette,
  Type,
  Image as ImageIcon,
  Trash2,
  PencilLine,
  Sparkles,
  Check,
  X,
  FileText,
  ShieldAlert,
} from 'lucide-react';
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
import { formatDate, formatDateTime, percent } from '../lib/format.js';

const TABS = [
  { value: 'guidelines', label: 'Guidelines' },
  { value: 'terms', label: 'Terminology' },
  { value: 'facts', label: 'Approved facts' },
  { value: 'assets', label: 'Brand assets' },
];

const CONFIDENTIALITY = [
  { value: 'public', label: 'Public' },
  { value: 'internal', label: 'Internal' },
  { value: 'restricted', label: 'Restricted — never sent externally' },
];

const EMPTY_GUIDELINE = { title: '', category: 'general', description: '', content: '', confidentiality: 'internal' };
const EMPTY_TERM = { term: '', preferredTerm: '', definition: '', category: 'general', severity: 'warning' };
const EMPTY_FACT = { statement: '', source: '', owner: '', expiresAt: '', confidentiality: 'internal', tags: '' };
const EMPTY_ASSET = { name: '', type: 'palette', hexValues: '', fontFamily: '', confidentiality: 'internal' };

export default function Knowledge() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('guidelines');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(EMPTY_GUIDELINE);
  const [file, setFile] = useState(null);
  const [draft, setDraft] = useState(null);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const summary = useQuery({ queryKey: ['knowledge-summary'], queryFn: endpoints.knowledgeSummary });
  const guidelines = useQuery({ queryKey: ['guidelines'], queryFn: () => endpoints.guidelines() });
  const terms = useQuery({ queryKey: ['terms'], queryFn: endpoints.terms });
  const facts = useQuery({ queryKey: ['facts'], queryFn: endpoints.facts });
  const assets = useQuery({ queryKey: ['assets'], queryFn: endpoints.assets });

  const detail = useQuery({
    queryKey: ['guideline', detailId],
    queryFn: () => endpoints.guideline(detailId),
    enabled: Boolean(detailId),
  });
  const clarity = useQuery({
    queryKey: ['clarity', detailId],
    queryFn: () => endpoints.clarity(detailId),
    enabled: Boolean(detailId),
  });

  const canManageGuidelines = ['admin', 'manager'].includes(user?.role);
  const canEditKnowledge = ['admin', 'manager', 'reviewer'].includes(user?.role);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['guidelines'] });
    queryClient.invalidateQueries({ queryKey: ['terms'] });
    queryClient.invalidateQueries({ queryKey: ['facts'] });
    queryClient.invalidateQueries({ queryKey: ['assets'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-summary'] });
    queryClient.invalidateQueries({ queryKey: ['clarity'] });
    queryClient.invalidateQueries({ queryKey: ['guideline', detailId] });
    queryClient.invalidateQueries({ queryKey: ['guideline-insights'] });
  }

  const createGuideline = useMutation({
    mutationFn: (body) => (editing ? endpoints.updateGuideline(editing.id, { ...body, changeNote: 'Edited in the knowledge base' }) : endpoints.createGuideline(body)),
    onSuccess: () => {
      success(editing ? 'Guideline updated with a new version.' : 'Guideline created.');
      closeModal();
      invalidateAll();
    },
    onError: (err) => toastError(err.message || 'Could not save the guideline'),
  });

  const importGuideline = useMutation({
    mutationFn: (formData) => endpoints.importGuideline(formData),
    onSuccess: () => {
      success('Guideline imported.');
      setFile(null);
      if (importRef.current) importRef.current.value = '';
      invalidateAll();
    },
    onError: (err) => toastError(err.message || 'Could not import that file'),
  });

  const archiveGuideline = useMutation({
    mutationFn: (id) => endpoints.archiveGuideline(id),
    onSuccess: () => {
      success('Guideline archived. Its versions remain in the audit trail.');
      invalidateAll();
      setDetailId(null);
    },
    onError: (err) => toastError(err.message || 'Could not archive that guideline'),
  });

  const createTerm = useMutation({
    mutationFn: (body) => endpoints.createTerm(body),
    onSuccess: () => { success('Term added.'); closeModal(); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not add that term'),
  });
  const createFact = useMutation({
    mutationFn: (body) => endpoints.createFact(body),
    onSuccess: () => { success('Approved fact added.'); closeModal(); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not add that fact'),
  });
  const createAsset = useMutation({
    mutationFn: (formData) => endpoints.createAsset(formData),
    onSuccess: () => { success('Brand asset added.'); closeModal(); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not add that asset'),
  });

  const deleteTerm = useMutation({
    mutationFn: (id) => endpoints.deleteTerm(id),
    onSuccess: () => { success('Term removed.'); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not remove that term'),
  });
  const deleteFact = useMutation({
    mutationFn: (id) => endpoints.deleteFact(id),
    onSuccess: () => { success('Fact removed.'); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not remove that fact'),
  });
  const deleteAsset = useMutation({
    mutationFn: (id) => endpoints.deleteAsset(id),
    onSuccess: () => { success('Asset removed.'); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not remove that asset'),
  });

  const importCsv = useMutation({
    mutationFn: (formData) => endpoints.importCsv(formData),
    onSuccess: (data) => { success(`${data.created} rows imported.`); invalidateAll(); },
    onError: (err) => toastError(err.message || 'Could not import that CSV'),
  });

  const draftMutation = useMutation({
    mutationFn: (id) => endpoints.draftGuideline(id),
    onSuccess: (data) => {
      setDraft(data.draft);
      success('A clearer draft is ready for review.');
      invalidateAll();
    },
    onError: (err) => toastError(err.message || 'Could not draft a clearer version'),
  });

  const draftDecision = useMutation({
    mutationFn: ({ id, decision, content }) => endpoints.draftDecision(id, { decision, content, note: decision === 'accepted' ? 'Accepted in the knowledge base' : 'Rejected in the knowledge base' }),
    onSuccess: (data) => {
      success(data.status === 'accepted' ? `Guideline published as version ${data.version}.` : 'Draft rejected. The old version stays active.');
      setDraft(null);
      invalidateAll();
    },
    onError: (err) => toastError(err.message || 'Could not save that decision'),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_GUIDELINE);
    setModal('guideline');
  }

  function openEdit(guideline) {
    setEditing(guideline);
    setForm({
      title: guideline.title || '',
      category: guideline.category || 'general',
      description: guideline.description || '',
      content: guideline.content || '',
      confidentiality: guideline.confidentiality || 'internal',
    });
    setModal('guideline');
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setForm(EMPTY_GUIDELINE);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function submitGuideline(event) {
    event.preventDefault();
    createGuideline.mutate({
      title: form.title.trim(),
      category: form.category.trim() || 'general',
      description: form.description.trim(),
      content: form.content.trim(),
      confidentiality: form.confidentiality,
    });
  }

  function submitTerm(event) {
    event.preventDefault();
    createTerm.mutate({
      term: form.term.trim(),
      preferredTerm: form.preferredTerm?.trim() || null,
      definition: form.definition?.trim() || null,
      category: form.category?.trim() || 'general',
      severity: form.severity || 'warning',
    });
  }

  function submitFact(event) {
    event.preventDefault();
    createFact.mutate({
      statement: form.statement.trim(),
      source: form.source?.trim() || null,
      owner: form.owner?.trim() || null,
      expiresAt: form.expiresAt || null,
      confidentiality: form.confidentiality,
      tags: form.tags?.trim() || null,
    });
  }

  function submitAsset(event) {
    event.preventDefault();
    const data = new FormData();
    data.append('name', form.name.trim());
    data.append('type', form.type);
    data.append('confidentiality', form.confidentiality);
    if (form.hexValues.trim()) data.append('hexValues', form.hexValues.trim());
    if (form.fontFamily.trim()) data.append('fontFamily', form.fontFamily.trim());
    if (file) data.append('file', file);
    createAsset.mutate(data);
  }

  const guidelineRows = (guidelines.data?.guidelines || []).filter((row) =>
    q ? `${row.title} ${row.category} ${row.content}`.toLowerCase().includes(q.toLowerCase()) : true
  );
  const termRows = (terms.data?.terms || []).filter((row) =>
    q ? `${row.term} ${row.preferred_term} ${row.definition}`.toLowerCase().includes(q.toLowerCase()) : true
  );
  const factRows = (facts.data?.facts || []).filter((row) =>
    q ? `${row.statement} ${row.source} ${row.tags}`.toLowerCase().includes(q.toLowerCase()) : true
  );
  const assetRows = (assets.data?.assets || []).filter((row) =>
    q ? `${row.name} ${row.type} ${row.hex_values}`.toLowerCase().includes(q.toLowerCase()) : true
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Governance"
        title="Brand knowledge base"
        description="The single source of truth every review is measured against. Guidelines are versioned; old versions are never deleted."
        actions={
          <>
            {['guidelines', 'terms', 'facts'].includes(tab) && canEditKnowledge ? (
              <button className="btn btn-sm" onClick={() => importRef.current?.click()} disabled={importCsv.isPending}>
                {importCsv.isPending ? <Spinner size={13} /> : <Upload size={13} />} Import CSV
              </button>
            ) : null}
            {canManageGuidelines ? (
              <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={14} /> New guideline</button>
            ) : null}
          </>
        }
      />

      <input
        ref={importRef}
        type="file"
        hidden
        accept=".csv"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          const type = tab === 'terms' ? 'terms' : 'facts';
          const data = new FormData();
          data.append('file', selected);
          data.append('type', type);
          importCsv.mutate(data);
          e.target.value = '';
        }}
      />

      <div className="grid grid-4">
        <StatCard label="Active guidelines" value={summary.data?.guidelines ?? '—'} note="Versioned, immutable history" icon={BookOpen} />
        <StatCard label="Preferred terms" value={summary.data?.terms ?? '—'} note="Banned and preferred wording" icon={Type} />
        <StatCard label="Approved facts" value={summary.data?.facts ?? '—'} note={`${summary.data?.restrictedFacts ?? 0} restricted`} icon={Quote} tone="var(--lilac)" />
        <StatCard label="Brand assets" value={summary.data?.assets ?? '—'} note="Logos, palettes and fonts" icon={Palette} tone="var(--green)" />
      </div>

      <div className="card card-pad stack-sm">
        <div className="row-between wrap">
          <div className="tabs" style={{ borderBottom: 'none' }}>
            {TABS.map((item) => (
              <button key={item.value} className={`tab ${tab === item.value ? 'active' : ''}`} onClick={() => setTab(item.value)} type="button">
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', minWidth: 230 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 34 }} placeholder="Search knowledge…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search knowledge" />
          </div>
        </div>
        <div className="tiny muted">
          Public, internal and restricted items are marked. Restricted knowledge is excluded before any external AI call.
        </div>
      </div>

      {tab === 'guidelines' ? (
        <section className="stack-sm">
          {guidelines.error ? <ErrorNotice error={guidelines.error} onRetry={() => guidelines.refetch()} /> : null}
          {guidelines.isLoading ? <div className="card card-pad"><SkeletonLines lines={5} /></div> : null}
          {guidelineRows.length ? guidelineRows.map((guideline) => (
            <article key={guideline.id} className="card card-pad card-hover">
              <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 240 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="version-pill">v{guideline.version}</span>
                    <h3>{guideline.title}</h3>
                    {guideline.status !== 'active' ? <Badge tone="tone-amber">{guideline.status}</Badge> : null}
                    {guideline.confidentiality === 'restricted' ? <Badge tone="tone-red"><ShieldAlert size={11} /> restricted</Badge> : (
                      <Badge tone={guideline.confidentiality === 'public' ? 'tone-green' : ''}>{guideline.confidentiality}</Badge>
                    )}
                  </div>
                  <div className="tiny muted mt-1">
                    {guideline.category} · {guideline.version_count} version{guideline.version_count === 1 ? '' : 's'} · updated {formatDate(guideline.updated_at)} · {guideline.created_by_name || 'Unknown author'}
                  </div>
                  {guideline.description ? <p className="tiny mt-2" style={{ maxWidth: 780 }}>{guideline.description}</p> : null}
                </div>
                <div className="row wrap">
                  <Badge tone={guideline.trigger_count ? 'tone-amber' : ''}>{guideline.trigger_count} triggers</Badge>
                  <button className="btn btn-sm" onClick={() => { setDetailId(guideline.id); setDraft(null); }}>Inspect</button>
                  {canManageGuidelines ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(guideline)}><PencilLine size={13} /> Edit</button>
                  ) : null}
                </div>
              </div>
            </article>
          )) : !guidelines.isLoading ? (
            <div className="card card-pad">
              <EmptyState
                icon={BookOpen}
                title={q ? 'No guidelines match that search' : 'No guidelines yet'}
                description={q ? 'Try a different word.' : 'Import a .txt, .md, .docx or .pdf guideline, or write one directly. Reviews start working as soon as a guideline is active.'}
                action={canManageGuidelines ? <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={14} /> Write the first guideline</button> : null}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'terms' ? (
        <section className="card">
          <div className="row-between wrap card-pad">
            <div>
              <h3>Terminology</h3>
              <span className="tiny muted">Every review checks these terms. Preferred replacements are used in suggestions.</span>
            </div>
            {canEditKnowledge ? (
              <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_TERM); setModal('term'); }}><Plus size={14} /> Add term</button>
            ) : null}
          </div>
          {termRows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Term</th><th>Preferred</th><th>Category</th><th>Severity</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {termRows.map((term) => (
                    <tr key={term.id}>
                      <td><strong>{term.term}</strong>{term.definition ? <div className="tiny muted">{term.definition}</div> : null}</td>
                      <td className="tiny">{term.preferred_term || '—'}</td>
                      <td><Badge>{term.category}</Badge></td>
                      <td><Badge tone={`sev-${term.severity}`}>{term.severity}</Badge></td>
                      <td className="text-right">
                        {canEditKnowledge ? (
                          <button className="btn btn-ghost btn-icon" onClick={() => deleteTerm.mutate(term.id)} title="Remove term" aria-label={`Remove ${term.term}`}>
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-pad"><EmptyState icon={Type} title="No terminology yet" description="Add banned phrases and their preferred alternatives, or import a CSV with term, preferred, definition, category." /></div>
          )}
        </section>
      ) : null}

      {tab === 'facts' ? (
        <section className="stack-sm">
          <div className="row-between wrap">
            <div>
              <h3>Approved facts</h3>
              <span className="tiny muted">Claims are checked against these statements, owners and expiry dates.</span>
            </div>
            {canEditKnowledge ? (
              <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_FACT); setModal('fact'); }}><Plus size={14} /> Add fact</button>
            ) : null}
          </div>
          {factRows.length ? (
            <div className="grid grid-2">
              {factRows.map((fact) => {
                const expired = fact.expires_at && new Date(fact.expires_at) < new Date();
                return (
                  <article key={fact.id} className="card card-pad stack-sm">
                    <div className="row-between wrap">
                      <Badge tone={fact.confidentiality === 'restricted' ? 'tone-red' : fact.confidentiality === 'public' ? 'tone-green' : ''}>{fact.confidentiality}</Badge>
                      <div className="row" style={{ gap: 6 }}>
                        {expired ? <Badge tone="tone-red">expired</Badge> : null}
                        {canEditKnowledge ? (
                          <button className="btn btn-ghost btn-icon" onClick={() => deleteFact.mutate(fact.id)} aria-label="Remove fact"><Trash2 size={14} /></button>
                        ) : null}
                      </div>
                    </div>
                    <p style={{ color: 'var(--text)' }}>{fact.statement}</p>
                    <div className="tiny muted">
                      Source: {fact.source || '—'} · Owner: {fact.owner || '—'} · {fact.expires_at ? `Expires ${formatDate(fact.expires_at)}` : 'No expiry'}
                    </div>
                    {fact.tags ? <div className="tiny muted">Tags: {String(fact.tags)}</div> : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card card-pad"><EmptyState icon={Quote} title="No approved facts yet" description="Without approved facts, claim checking can only say “no source”. Add statements your organisation can stand behind." /></div>
          )}
        </section>
      ) : null}

      {tab === 'assets' ? (
        <section className="stack-sm">
          <div className="row-between wrap">
            <div>
              <h3>Brand assets</h3>
              <span className="tiny muted">Logos, palettes and fonts are used for visual and accessibility checks.</span>
            </div>
            {canEditKnowledge ? (
              <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_ASSET); setFile(null); setModal('asset'); }}><Plus size={14} /> Add asset</button>
            ) : null}
          </div>
          {assetRows.length ? (
            <div className="grid grid-3">
              {assetRows.map((asset) => {
                const swatches = (asset.hex_values || '').split(/[,\s]+/).filter(Boolean);
                return (
                  <article key={asset.id} className="card card-pad stack-sm">
                    <div className="row-between wrap">
                      <Badge tone="tone-indigo">{asset.type}</Badge>
                      <div className="row" style={{ gap: 6 }}>
                        {asset.confidentiality === 'restricted' ? <Badge tone="tone-red">restricted</Badge> : null}
                        {canEditKnowledge ? (
                          <button className="btn btn-ghost btn-icon" onClick={() => deleteAsset.mutate(asset.id)} aria-label="Remove asset"><Trash2 size={14} /></button>
                        ) : null}
                      </div>
                    </div>
                    {asset.file_url && ['logo', 'image'].includes(asset.type) ? (
                      <div style={{ background: 'rgba(2,6,12,0.5)', borderRadius: 10, padding: 10, display: 'grid', placeItems: 'center', minHeight: 110 }}>
                        <img src={asset.file_url} alt={asset.name} style={{ maxWidth: '100%', maxHeight: 100 }} />
                      </div>
                    ) : (
                      <div className="row wrap">
                        {swatches.length ? swatches.map((hex) => <span key={hex} className="swatch" style={{ background: hex }} title={hex} />) : <ImageIcon size={22} style={{ color: 'var(--muted)' }} />}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{asset.name}</div>
                      <div className="tiny muted">
                        {asset.font_family || ''} {swatches.length ? swatches.join(' · ') : ''}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card card-pad"><EmptyState icon={Palette} title="No brand assets yet" description="Upload the approved logo, add the palette hex values and list approved fonts so image reviews can verify them." /></div>
          )}
        </section>
      ) : null}

      {/* Create / edit guideline */}
      <Modal
        open={modal === 'guideline'}
        onClose={closeModal}
        title={editing ? `Edit “${editing.title}”` : 'New guideline'}
        subtitle={editing ? 'Saving creates a new immutable version; the previous version stays available.' : 'Guidelines are matched against every review once active.'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeModal} type="button">Cancel</button>
            <button className="btn btn-primary" type="submit" form="guideline-form" disabled={createGuideline.isPending}>
              {createGuideline.isPending ? 'Saving…' : editing ? 'Save new version' : 'Create guideline'}
            </button>
          </>
        }
      >
        <form id="guideline-form" className="stack-sm" onSubmit={submitGuideline}>
          <Field label="Title" htmlFor="g-title"><input id="g-title" className="input" required minLength={3} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Tone of voice — product marketing" /></Field>
          <div className="grid grid-2">
            <Field label="Category" htmlFor="g-category"><input id="g-category" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="tone" /></Field>
            <Field label="Confidentiality" htmlFor="g-conf"><select id="g-conf" className="select" value={form.confidentiality} onChange={(e) => setForm((f) => ({ ...f, confidentiality: e.target.value }))}>{CONFIDENTIALITY.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          </div>
          <Field label="Short description" htmlFor="g-desc"><input id="g-desc" className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What this guideline covers" /></Field>
          <Field label="Guideline content" htmlFor="g-content" hint="Markdown is fine. Worked examples make a guideline more likely to be followed.">
            <textarea id="g-content" className="textarea" required minLength={10} style={{ minHeight: 260 }} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={'## What good looks like\n- Plain, specific language…\n\n## What to avoid\n- Unsupported superlatives…'} />
          </Field>
          <div className="row wrap">
            <span className="tiny muted">Prefer importing a document?</span>
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> Import .txt/.md/.docx/.pdf
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".txt,.md,.markdown,.docx,.pdf"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                const data = new FormData();
                data.append('file', selected);
                data.append('title', form.title || selected.name.replace(/\.[^.]+$/, ''));
                data.append('category', form.category || 'general');
                data.append('confidentiality', form.confidentiality);
                importGuideline.mutate(data);
              }}
            />
          </div>
        </form>
      </Modal>

      {/* Term modal */}
      <Modal open={modal === 'term'} onClose={closeModal} title="Add a terminology rule" footer={
        <>
          <button className="btn btn-ghost" onClick={closeModal} type="button">Cancel</button>
          <button className="btn btn-primary" type="submit" form="term-form" disabled={createTerm.isPending}>{createTerm.isPending ? 'Adding…' : 'Add term'}</button>
        </>
      }>
        <form id="term-form" className="stack-sm" onSubmit={submitTerm}>
          <Field label="Term or phrase" htmlFor="t-term"><input id="t-term" className="input" required value={form.term} onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))} placeholder="best-in-class" /></Field>
          <Field label="Preferred replacement" htmlFor="t-preferred"><input id="t-preferred" className="input" value={form.preferredTerm || ''} onChange={(e) => setForm((f) => ({ ...f, preferredTerm: e.target.value }))} placeholder="leading" /></Field>
          <Field label="Definition or reason" htmlFor="t-definition"><textarea id="t-definition" className="textarea" style={{ minHeight: 70 }} value={form.definition || ''} onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))} /></Field>
          <div className="grid grid-2">
            <Field label="Category" htmlFor="t-category"><input id="t-category" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></Field>
            <Field label="Severity" htmlFor="t-severity"><select id="t-severity" className="select" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}><option value="info">Info</option><option value="suggestion">Suggestion</option><option value="warning">Warning</option><option value="error">Error</option></select></Field>
          </div>
        </form>
      </Modal>

      {/* Fact modal */}
      <Modal open={modal === 'fact'} onClose={closeModal} title="Add an approved fact" subtitle="Claims will cite this statement, source and owner." footer={
        <>
          <button className="btn btn-ghost" onClick={closeModal} type="button">Cancel</button>
          <button className="btn btn-primary" type="submit" form="fact-form" disabled={createFact.isPending}>{createFact.isPending ? 'Adding…' : 'Add fact'}</button>
        </>
      }>
        <form id="fact-form" className="stack-sm" onSubmit={submitFact}>
          <Field label="Statement" htmlFor="f-statement"><textarea id="f-statement" className="textarea" required minLength={5} style={{ minHeight: 90 }} value={form.statement} onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))} placeholder="Our platform processes 1.2 million reviews per month." /></Field>
          <div className="grid grid-2">
            <Field label="Source" htmlFor="f-source"><input id="f-source" className="input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="Analytics, Q2 2026" /></Field>
            <Field label="Owner" htmlFor="f-owner"><input id="f-owner" className="input" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} placeholder="Data team" /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Expires" htmlFor="f-expiry" hint="Old facts produce “outdated” verdicts."><input id="f-expiry" className="input" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></Field>
            <Field label="Confidentiality" htmlFor="f-conf"><select id="f-conf" className="select" value={form.confidentiality} onChange={(e) => setForm((f) => ({ ...f, confidentiality: e.target.value }))}>{CONFIDENTIALITY.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          </div>
          <Field label="Tags" htmlFor="f-tags" hint="Comma separated."><input id="f-tags" className="input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="pricing, support, launch" /></Field>
        </form>
      </Modal>

      {/* Asset modal */}
      <Modal open={modal === 'asset'} onClose={closeModal} title="Add a brand asset" subtitle="Logos and images are stored under server storage and served only through authenticated routes." footer={
        <>
          <button className="btn btn-ghost" onClick={closeModal} type="button">Cancel</button>
          <button className="btn btn-primary" type="submit" form="asset-form" disabled={createAsset.isPending}>{createAsset.isPending ? 'Adding…' : 'Add asset'}</button>
        </>
      }>
        <form id="asset-form" className="stack-sm" onSubmit={submitAsset}>
          <Field label="Asset name" htmlFor="a-name"><input id="a-name" className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Primary logo — light" /></Field>
          <div className="grid grid-2">
            <Field label="Type" htmlFor="a-type"><select id="a-type" className="select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option value="logo">Logo</option><option value="palette">Palette</option><option value="font">Font</option><option value="image">Image</option></select></Field>
            <Field label="Confidentiality" htmlFor="a-conf"><select id="a-conf" className="select" value={form.confidentiality} onChange={(e) => setForm((f) => ({ ...f, confidentiality: e.target.value }))}>{CONFIDENTIALITY.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          </div>
          {['logo', 'image'].includes(form.type) ? (
            <Field label="Image file" htmlFor="a-file"><input id="a-file" className="input" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.svg" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          ) : null}
          {form.type === 'palette' ? (
            <Field label="Hex colours" htmlFor="a-hex" hint="Comma separated, for example #6C5CE7, #5FE3F5, #B8A9FF."><input id="a-hex" className="input" value={form.hexValues} onChange={(e) => setForm((f) => ({ ...f, hexValues: e.target.value }))} placeholder="#6C5CE7, #5FE3F5" /></Field>
          ) : null}
          {form.type === 'font' ? (
            <Field label="Font family" htmlFor="a-font"><input id="a-font" className="input" value={form.fontFamily} onChange={(e) => setForm((f) => ({ ...f, fontFamily: e.target.value }))} placeholder="Fraunces / Inter" /></Field>
          ) : null}
        </form>
      </Modal>

      {/* Guideline inspector */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => { setDetailId(null); setDraft(null); }}
        title={detail.data?.guideline?.title || 'Guideline'}
        subtitle={detail.data?.guideline ? `Version ${detail.data.guideline.version} · ${detail.data.guideline.category} · ${detail.data.guideline.confidentiality}` : undefined}
        width="min(900px, 100%)"
        footer={
          <>
            {canManageGuidelines && detail.data?.guideline ? (
              <button className="btn btn-ghost" type="button" onClick={() => openEdit(detail.data.guideline)}><PencilLine size={13} /> Edit guideline</button>
            ) : null}
            {user?.role === 'admin' && detail.data?.guideline ? (
              <button className="btn btn-danger" type="button" onClick={() => archiveGuideline.mutate(detail.data.guideline.id)} disabled={archiveGuideline.isPending}>Archive</button>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={() => { setDetailId(null); setDraft(null); }}>Close</button>
          </>
        }
      >
        {detail.isLoading ? <SkeletonLines lines={6} /> : detail.error ? <ErrorNotice error={detail.error} /> : detail.data ? (
          <div className="stack">
            <div className="tiny muted">{detail.data.guideline.description}</div>
            <div className="panel card-pad" style={{ maxHeight: 300, overflow: 'auto' }}>
              <div className="content-body">{detail.data.guideline.content}</div>
            </div>

            <div className="divider" />
            <div className="row-between wrap">
              <h3>Clarity diagnosis</h3>
              {clarity.data?.needsClarity ? <Badge tone="tone-amber">needs clarity</Badge> : <Badge tone="tone-green">within threshold</Badge>}
            </div>
            {clarity.isLoading ? <SkeletonLines lines={3} /> : clarity.data ? (
              <div className="stack-sm">
                <div className="grid grid-3">
                  <div className="panel card-pad"><div className="stat-label">Sample size</div><div className="stat-value" style={{ fontSize: '1.5rem' }}>{clarity.data.sampleSize}</div><div className="tiny muted">minimum {clarity.data.minimumSample}</div></div>
                  <div className="panel card-pad"><div className="stat-label">Override rate</div><div className="stat-value" style={{ fontSize: '1.5rem' }}>{percent(clarity.data.overrideRate)}</div><div className="tiny muted">{clarity.data.overridden} overrides</div></div>
                  <div className="panel card-pad"><div className="stat-label">Rejection rate</div><div className="stat-value" style={{ fontSize: '1.5rem' }}>{percent(clarity.data.rejectionRate)}</div><div className="tiny muted">{clarity.data.rejected} rejected</div></div>
                </div>
                <p className="tiny">{clarity.data.evidence}</p>
                {clarity.data.commonReasons?.length ? (
                  <div className="tiny muted">Common reviewer reasons: {clarity.data.commonReasons.join(' · ')}</div>
                ) : null}
                <div className="row wrap">
                  <button className="btn btn-sm" onClick={() => draftMutation.mutate(detailId)} disabled={draftMutation.isPending || !canManageGuidelines}>
                    {draftMutation.isPending ? <Spinner size={13} /> : <Sparkles size={13} />} {draftMutation.isPending ? 'Drafting…' : 'Draft a clearer version'}
                  </button>
                  {!canManageGuidelines ? <span className="tiny muted">Admins and managers can create drafts.</span> : null}
                </div>
              </div>
            ) : null}

            {draft ? (
              <div className="draft-diff stack-sm">
                <div className="row-between wrap">
                  <div className="row" style={{ gap: 8 }}>
                    <Sparkles size={15} style={{ color: 'var(--lilac)' }} />
                    <strong>Draft version {draft.base_version + 1}</strong>
                    {draft.engine ? <Badge tone="tone-indigo">{draft.engine}</Badge> : null}
                  </div>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => draftDecision.mutate({ id: draft.id, decision: 'rejected' })} disabled={draftDecision.isPending}><X size={12} /> Reject</button>
                    <button className="btn btn-accept btn-sm" onClick={() => draftDecision.mutate({ id: draft.id, decision: 'accepted', content: draft.content })} disabled={draftDecision.isPending}><Check size={12} /> Accept & publish</button>
                  </div>
                </div>
                {draft.rationale?.length ? (
                  <div className="stack-sm">
                    {draft.rationale.slice(0, 5).map((item, index) => (
                      <div key={index} className="tiny"><strong>{item.change}</strong> — {item.reason}</div>
                    ))}
                  </div>
                ) : null}
                <div className="panel card-pad" style={{ maxHeight: 320, overflow: 'auto' }}>
                  <div className="content-body">{draft.content}</div>
                </div>
                <div className="tiny muted">Accepting creates a new immutable guideline version and keeps the old one. Nothing is overwritten.</div>
              </div>
            ) : null}

            <div className="divider" />
            <h3>Version history</h3>
            <div className="stack-sm">
              {(detail.data.versions || []).map((version) => (
                <div key={version.id} className="row-between wrap kb-item">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="version-pill">v{version.version}</span>
                    <span className="tiny">{version.title}</span>
                    <span className="tiny muted">by {version.created_by_name || 'Unknown'} · {formatDateTime(version.created_at)}</span>
                  </div>
                  <span className="tiny muted">{version.change_note || 'No note'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
