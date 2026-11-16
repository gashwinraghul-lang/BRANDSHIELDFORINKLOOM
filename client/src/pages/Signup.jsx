// client/src/pages/Signup.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        organizationName: form.organizationName.trim() || undefined,
      });
      success('Workspace created. You are the admin.');
      navigate('/app', { replace: true });
    } catch (err) {
      const message =
        err.status === 409
          ? 'An account with that email already exists. Try signing in instead.'
          : err.message || 'Could not create your workspace.';
      setError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="eyebrow mb-2">Create workspace</div>
      <h2>Start governing your brand.</h2>
      <p className="tiny muted mt-1 mb-3">
        You&apos;ll be the admin of a new organisation. You can invite reviewers and creators afterwards.
      </p>

      <form className="stack-sm" onSubmit={handleSubmit}>
        <Field label="Your name" htmlFor="signup-name">
          <input
            id="signup-name"
            className="input"
            autoComplete="name"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Sudharsan B"
          />
        </Field>
        <Field label="Work email" htmlFor="signup-email">
          <input
            id="signup-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Organisation name" htmlFor="signup-org" hint="Leave blank to use “Your name’s workspace”.">
          <input
            id="signup-org"
            className="input"
            value={form.organizationName}
            onChange={(e) => update('organizationName', e.target.value)}
            placeholder="Inkloom AI"
          />
        </Field>
        <Field label="Password" htmlFor="signup-password" hint="At least 8 characters.">
          <input
            id="signup-password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary btn-lg w-full mt-1" type="submit" disabled={submitting}>
          {submitting ? <Spinner size={16} /> : <UserPlus size={16} />}
          {submitting ? 'Creating workspace…' : 'Create workspace'}
        </button>
      </form>

      <div className="auth-foot">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
      <div className="hint mt-2">
        In development, verification emails are written to the server console as a clickable link.
      </div>
    </AuthLayout>
  );
}
