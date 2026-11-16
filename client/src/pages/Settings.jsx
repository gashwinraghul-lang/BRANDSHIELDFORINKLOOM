// client/src/pages/Settings.jsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Sparkles,
  Bot,
  Mail,
  Lock,
  Users,
  Send,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  UserPlus,
  Activity,
  PlugZap,
} from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  DisclosurePanel,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  SkeletonLines,
  Spinner,
  StatCard,
} from '../components/ui.jsx';
import { formatDateTime, initials, relativeTime } from '../lib/format.js';

const ROLES = [
  { value: 'admin', label: 'Admin — full access, settings, team' },
  { value: 'manager', label: 'Manager — assign, decide, manage knowledge' },
  { value: 'reviewer', label: 'Reviewer — review, decide, add facts' },
  { value: 'creator', label: 'Creator — submit content and discuss' },
  { value: 'agency', label: 'Agency — external submission access' },
];

const ROLE_TONE = {
  admin: 'tone-indigo',
  manager: 'tone-green',
  reviewer: 'tone-amber',
  creator: '',
  agency: 'tone-muted',
};

export default function Settings() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [orgForm, setOrgForm] = useState({ name: '', brandTone: '' });
  const [invite, setInvite] = useState({ email: '', name: '', role: 'creator' });
  const [pingResult, setPingResult] = useState(null);

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: endpoints.settings });
  const aiLog = useQuery({
    queryKey: ['ai-log'],
    queryFn: endpoints.aiLog,
    enabled: ['admin', 'manager'].includes(user?.role),
  });

  const data = settingsQuery.data;
  const organization = data?.organization;
  const isAdmin = user?.role === 'admin';
  const canInvite = ['admin', 'manager'].includes(user?.role);

  useEffect(() => {
    if (organization) {
      setOrgForm({ name: organization.name || '', brandTone: organization.brand_tone || '' });
    }
  }, [organization]);

  const updateOrg = useMutation({
    mutationFn: (body) => endpoints.updateOrganization(body),
    onSuccess: () => {
      success('Organisation settings saved.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toastError(err.message || 'Could not save those settings'),
  });

  const inviteMutation = useMutation({
    mutationFn: (body) => endpoints.invite(body),
    onSuccess: (result) => {
      success(
        result.emailSent
          ? `Invitation sent to ${result.invited.email}.`
          : `Invitation created for ${result.invited.email}. The email is logged in the server console in development.`
      );
      setInvite({ email: '', name: '', role: 'creator' });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (err) => toastError(err.message || 'Could not invite that person'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => endpoints.updateRole(id, role),
    onSuccess: () => {
      success('Role updated.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (err) => toastError(err.message || 'Could not change that role'),
  });

  const ping = useMutation({
    mutationFn: endpoints.pingAgent,
    onSuccess: (result) => {
      setPingResult(result);
      if (result.online) success(`Agent online${result.latencyMs ? ` · ${result.latencyMs} ms` : ''}.`);
      else toastError(result.message || result.error || 'The agent bridge did not answer.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => {
      setPingResult({ online: false, error: err.message });
      toastError(err.message || 'Could not reach the agent bridge');
    },
  });

  if (settingsQuery.isLoading) {
    return (
      <div className="stack">
        <PageHeader eyebrow="Admin" title="Settings" description="Organisation, AI, agent bridge, email and team." />
        <div className="card card-pad"><SkeletonLines lines={6} /></div>
      </div>
    );
  }

  if (settingsQuery.error) {
    return (
      <div className="stack">
        <PageHeader eyebrow="Admin" title="Settings" description="Organisation, AI, agent bridge, email and team." />
        <ErrorNotice error={settingsQuery.error} onRetry={() => settingsQuery.refetch()} />
      </div>
    );
  }

  const ai = data?.ai || {};
  const agent = data?.agent || {};
  const email = data?.email || {};
  const team = data?.team || [];
  const calls = aiLog.data?.calls || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Control the organisation, see exactly when external AI is used, check the agent bridge, and manage who can approve what."
        actions={
          <button className="btn btn-sm" onClick={() => settingsQuery.refetch()} disabled={settingsQuery.isFetching}>
            {settingsQuery.isFetching ? <Spinner size={14} /> : <RefreshCw size={14} />} Refresh status
          </button>
        }
      />

      <div className="grid grid-4">
        <StatCard
          label="Groq"
          value={ai.configured ? 'Connected' : 'Off'}
          note={ai.configured ? ai.model || 'Language model enabled' : 'Deterministic engines only'}
          icon={Sparkles}
          tone={ai.configured ? 'var(--green)' : 'var(--muted)'}
        />
        <StatCard
          label="External AI calls"
          value={ai.callsLast30Days ?? 0}
          note="Last 30 days, from ai_call_log"
          icon={Activity}
          tone="var(--lilac)"
        />
        <StatCard
          label="Agentverse bridge"
          value={agent.online ? 'Online' : 'Offline'}
          note={agent.online ? `${agent.successes || 0} of ${agent.totalCalls || 0} calls succeeded` : 'Direct review fallback is active'}
          icon={Bot}
          tone={agent.online ? 'var(--green)' : 'var(--muted)'}
        />
        <StatCard
          label="Email delivery"
          value={email.configured ? 'Configured' : 'Console'}
          note={email.configured ? email.host || 'SMTP ready' : 'Development links are logged'}
          icon={Mail}
          tone={email.configured ? 'var(--cyan)' : 'var(--muted)'}
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <Building2 size={16} style={{ color: 'var(--cyan)' }} />
            <h3>Organisation</h3>
            {organization?.slug ? <Badge className="mono">{organization.slug}</Badge> : null}
          </div>
          <p className="tiny muted">
            The organisation name appears in the workspace switcher, audit exports and invitation emails.
          </p>
          <form
            className="stack-sm"
            onSubmit={(event) => {
              event.preventDefault();
              updateOrg.mutate({ name: orgForm.name.trim(), brandTone: orgForm.brandTone.trim() || null });
            }}
          >
            <Field label="Organisation name" htmlFor="org-name">
              <input
                id="org-name"
                className="input"
                required
                minLength={2}
                maxLength={160}
                value={orgForm.name}
                onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
                disabled={!isAdmin}
              />
            </Field>
            <Field
              label="Default brand tone"
              htmlFor="org-tone"
              hint="A short reminder used when reviewers ask for a rewrite. Guidelines remain the source of truth."
            >
              <input
                id="org-tone"
                className="input"
                maxLength={255}
                value={orgForm.brandTone}
                onChange={(e) => setOrgForm((f) => ({ ...f, brandTone: e.target.value }))}
                placeholder="Clear, warm, specific — never boastful"
                disabled={!isAdmin}
              />
            </Field>
            {isAdmin ? (
              <button className="btn btn-primary" type="submit" disabled={updateOrg.isPending} style={{ alignSelf: 'flex-start' }}>
                {updateOrg.isPending ? <Spinner size={14} /> : <ShieldCheck size={14} />} Save organisation
              </button>
            ) : (
              <div className="disclosure tiny">Only admins can edit organisation settings. Your role is <strong>{user?.role}</strong>.</div>
            )}
          </form>
        </section>

        <div className="stack">
          <section className="card card-pad stack-sm">
            <div className="row-between wrap">
              <div className="row" style={{ gap: 8 }}>
                <Sparkles size={16} style={{ color: 'var(--lilac)' }} />
                <h3>AI provider</h3>
                <Badge tone={ai.configured ? 'tone-green' : 'tone-muted'}>{ai.configured ? 'enabled' : 'disabled'}</Badge>
              </div>
              <span className="tiny muted">Fallback: {ai.fallback || 'deterministic engines'}</span>
            </div>
            <div className="stack-sm">
              <div className="row-between">
                <span className="tiny muted">Provider</span>
                <span className="tiny">{ai.provider || 'Groq'}</span>
              </div>
              <div className="row-between">
                <span className="tiny muted">Model</span>
                <span className="tiny mono">{ai.model || '—'}</span>
              </div>
              <div className="row-between">
                <span className="tiny muted">Calls (30 days)</span>
                <span className="tiny">{ai.callsLast30Days ?? 0}</span>
              </div>
            </div>
            <p className="tiny muted">
              {ai.disclosure ||
                'Emails and phone numbers are redacted before any external call. Restricted material is never sent.'}
            </p>
          </section>

          <section className="card card-pad stack-sm">
            <div className="row-between wrap">
              <div className="row" style={{ gap: 8 }}>
                <PlugZap size={16} style={{ color: 'var(--cyan)' }} />
                <h3>Agentverse bridge</h3>
                <Badge tone={agent.online ? 'tone-green' : 'tone-muted'}>{agent.online ? 'bridge' : 'offline'}</Badge>
              </div>
              <button className="btn btn-sm" onClick={() => ping.mutate()} disabled={ping.isPending}>
                {ping.isPending ? <Spinner size={13} /> : <Bot size={13} />} Ping agent
              </button>
            </div>
            <div className="stack-sm">
              <div className="row-between">
                <span className="tiny muted">Address</span>
                <span className="tiny mono truncate" style={{ maxWidth: 260 }}>{agent.address || 'Not configured'}</span>
              </div>
              <div className="row-between">
                <span className="tiny muted">Mode</span>
                <span className="tiny">{agent.mode || 'offline'}</span>
              </div>
              <div className="row-between">
                <span className="tiny muted">Calls recorded</span>
                <span className="tiny">{agent.totalCalls ?? 0} · {agent.successes ?? 0} successful</span>
              </div>
              <div className="row-between">
                <span className="tiny muted">Last call</span>
                <span className="tiny">{agent.lastCall ? formatDateTime(agent.lastCall) : '—'}</span>
              </div>
            </div>
            {pingResult ? (
              <div className="disclosure tiny">
                <strong>{pingResult.online ? 'Agent responded.' : 'Agent did not respond.'}</strong>{' '}
                {pingResult.latencyMs ? `${pingResult.latencyMs} ms. ` : ''}
                {pingResult.status ? `HTTP ${pingResult.status}. ` : ''}
                {pingResult.message || pingResult.error || 'No extra detail.'}
              </div>
            ) : (
              <p className="tiny muted">
                When the bridge is offline every submission is reviewed directly, with the same deterministic engines.
                Nothing in the UI pretends the agent answered.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <Lock size={16} style={{ color: 'var(--amber)' }} />
            <h3>Confidentiality &amp; retention</h3>
          </div>
          <p className="tiny">{data?.confidentiality?.rule}</p>
          <div className="row wrap">
            {(data?.confidentiality?.levels || ['public', 'internal', 'restricted']).map((level) => (
              <Badge key={level} tone={level === 'restricted' ? 'tone-red' : level === 'public' ? 'tone-green' : ''}>
                {level === 'restricted' ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />} {level}
              </Badge>
            ))}
          </div>
          <div className="stack-sm tiny muted">
            <div>Uploads: {data?.retention?.uploads}</div>
            <div>Audit log: {data?.retention?.auditLog}</div>
          </div>
          <DisclosurePanel compact />
        </section>

        <section className="card card-pad stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <Mail size={16} style={{ color: 'var(--cyan)' }} />
            <h3>Email delivery</h3>
            <Badge tone={email.configured ? 'tone-green' : 'tone-muted'}>{email.configured ? 'SMTP' : 'console'}</Badge>
          </div>
          <p className="tiny muted">
            Verification, password reset and invitation emails are sent through the configured SMTP server. In
            development with no SMTP host, the server writes a clickable link to its console instead so nothing depends
            on an external inbox.
          </p>
          <div className="row-between tiny">
            <span className="muted">Host</span>
            <span className="mono">{email.host || 'not configured'}</span>
          </div>
          <div className="row-between tiny">
            <span className="muted">Your email</span>
            <span>{user?.email}</span>
          </div>
          <div className="row-between tiny">
            <span className="muted">Verified</span>
            <span>{user?.emailVerified ? 'Verified' : 'Not yet'}</span>
          </div>
        </section>
      </div>

      <section className="card card-pad stack-sm">
        <div className="row-between wrap">
          <div className="row" style={{ gap: 8 }}>
            <Users size={16} style={{ color: 'var(--lilac)' }} />
            <h3>Team</h3>
            <Badge>{team.length}</Badge>
          </div>
          <span className="tiny muted">Roles are enforced on the server for every route.</span>
        </div>

        {team.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Joined</th>
                  {isAdmin ? <th aria-label="Change role" /> : null}
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="row" style={{ gap: 9 }}>
                        <div className="avatar avatar-sm">{initials(member.name || member.email)}</div>
                        <div>
                          <div className="tiny" style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {member.name || member.email}
                            {member.id === user?.id ? <span className="muted"> (you)</span> : null}
                          </div>
                          <div className="tiny muted">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={ROLE_TONE[member.role] || ''}>{member.role}</Badge>
                    </td>
                    <td>
                      <Badge tone={member.status === 'active' ? 'tone-green' : 'tone-amber'}>{member.status}</Badge>
                    </td>
                    <td className="tiny muted">{member.last_login_at ? relativeTime(member.last_login_at) : 'Never'}</td>
                    <td className="tiny muted">{formatDateTime(member.created_at)}</td>
                    {isAdmin ? (
                      <td className="text-right">
                        <select
                          className="select"
                          style={{ width: 140 }}
                          value={member.role}
                          disabled={roleMutation.isPending || member.id === user?.id}
                          onChange={(e) => roleMutation.mutate({ id: member.id, role: e.target.value })}
                          aria-label={`Role for ${member.name || member.email}`}
                        >
                          {ROLES.map((role) => (
                            <option key={role.value} value={role.value}>{role.value}</option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No teammates yet" description="Invite a reviewer or a creator below." />
        )}

        {canInvite ? (
          <>
            <div className="divider" />
            <form
              className="grid grid-3"
              style={{ gap: 12, alignItems: 'end' }}
              onSubmit={(event) => {
                event.preventDefault();
                inviteMutation.mutate({
                  email: invite.email.trim(),
                  name: invite.name.trim() || null,
                  role: invite.role,
                });
              }}
            >
              <Field label="Email" htmlFor="invite-email">
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  required
                  value={invite.email}
                  onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
                  placeholder="teammate@company.com"
                />
              </Field>
              <Field label="Name" htmlFor="invite-name" hint="Optional.">
                <input
                  id="invite-name"
                  className="input"
                  value={invite.name}
                  onChange={(e) => setInvite((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Alex Reviewer"
                />
              </Field>
              <Field label="Role" htmlFor="invite-role">
                <select
                  id="invite-role"
                  className="select"
                  value={invite.role}
                  onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.filter((role) => role.value !== 'admin' || isAdmin).map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </Field>
              <div className="row" style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? <Spinner size={14} /> : <UserPlus size={14} />} Send invitation
                </button>
                <span className="tiny muted">The invite creates a pending account with a one-time password link.</span>
              </div>
            </form>
          </>
        ) : null}
      </section>

      {['admin', 'manager'].includes(user?.role) ? (
        <section className="card card-pad stack-sm">
          <div className="row-between wrap">
            <div className="row" style={{ gap: 8 }}>
              <Activity size={16} style={{ color: 'var(--cyan)' }} />
              <h3>External AI call log</h3>
              <Badge>{calls.length}</Badge>
            </div>
            <span className="tiny muted">Newest first. Restricted content never appears here.</span>
          </div>
          {aiLog.isLoading ? (
            <SkeletonLines lines={4} />
          ) : calls.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Service</th>
                    <th>Purpose</th>
                    <th>Model</th>
                    <th>Result</th>
                    <th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.slice(0, 40).map((call) => (
                    <tr key={call.id}>
                      <td className="tiny muted nowrap">{formatDateTime(call.created_at)}</td>
                      <td className="tiny">{call.service}</td>
                      <td className="tiny">{call.purpose || call.kind || '—'}</td>
                      <td className="tiny mono">{call.model || '—'}</td>
                      <td>
                        <Badge tone={call.ok ? 'tone-green' : 'tone-red'}>{call.ok ? 'ok' : 'failed'}</Badge>
                      </td>
                      <td className="tiny muted">{call.duration_ms != null ? `${call.duration_ms} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Send}
              title="No external AI calls yet"
              description="Every Groq request is written here. If the key is missing, nothing is logged and the deterministic engines handle the review."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
