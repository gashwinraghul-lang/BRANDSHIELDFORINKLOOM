// client/src/pages/Login.jsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ArrowRight } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const DEMO = { email: 'demo@brandshield.test', password: 'DemoPass123!' };

export default function Login() {
  const { login } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
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
      await login({ email: form.email.trim(), password: form.password });
      success('Welcome back.');
      const next = location.state?.from || '/app';
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in.');
      toastError(err.message || 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="eyebrow mb-2">Sign in</div>
      <h2>Welcome back.</h2>
      <p className="tiny muted mt-1 mb-3">Your workspace, reviews and audit trail are waiting.</p>

      <form className="stack-sm" onSubmit={handleSubmit}>
        <Field label="Work email" htmlFor="login-email">
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary btn-lg w-full mt-1" type="submit" disabled={submitting}>
          {submitting ? <Spinner size={16} /> : <LogIn size={16} />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="row-between mt-2">
        <Link to="/forgot-password" className="tiny">Forgot your password?</Link>
        <Link to="/signup" className="tiny">Create an account</Link>
      </div>

      <div className="demo-box">
        <div className="row-between wrap">
          <span>Demo workspace: <strong style={{ color: 'var(--text)' }}>{DEMO.email}</strong> / <strong style={{ color: 'var(--text)' }}>{DEMO.password}</strong></span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setForm(DEMO)}
          >
            Use demo
          </button>
        </div>
      </div>

      <div className="auth-foot row" style={{ gap: 6 }}>
        <ArrowRight size={13} /> New here? The sign-up form creates your own organisation and makes you its admin.
      </div>
    </AuthLayout>
  );
}
