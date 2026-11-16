// client/src/pages/ResetPassword.jsx
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { endpoints } from '../api/client.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await endpoints.resetPassword({ token, password });
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (err) {
      setError(err.message || 'Could not reset your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="eyebrow mb-2">Choose a new password</div>
      <h2>{done ? 'Password updated.' : 'Set a new password.'}</h2>
      {!token ? (
        <>
          <p className="tiny muted mt-1">This page needs a reset token from your email.</p>
          <div className="auth-foot"><Link to="/forgot-password">Request a new link</Link></div>
        </>
      ) : done ? (
        <p className="tiny muted mt-2">Redirecting you to sign in…</p>
      ) : (
        <form className="stack-sm mt-2" onSubmit={handleSubmit}>
          <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
            <input
              id="reset-password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Repeat new password" htmlFor="reset-confirm">
            <input
              id="reset-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error ? <div className="error-text">{error}</div> : null}
          <button className="btn btn-primary btn-lg w-full" type="submit" disabled={submitting}>
            {submitting ? <Spinner size={16} /> : <KeyRound size={16} />}
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
