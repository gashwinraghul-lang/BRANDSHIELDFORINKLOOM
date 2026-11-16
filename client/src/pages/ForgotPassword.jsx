// client/src/pages/ForgotPassword.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { endpoints } from '../api/client.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const result = await endpoints.forgotPassword({ email: email.trim() });
      setMessage(result.message || 'If that email exists, a reset link is on its way.');
    } catch (err) {
      setMessage(err.message || 'Could not send the reset email.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="eyebrow mb-2">Password reset</div>
      <h2>Forgot your password?</h2>
      <p className="tiny muted mt-1 mb-3">
        Enter the email on your account. If it exists, we&apos;ll send a link that is valid for one hour.
      </p>
      <form className="stack-sm" onSubmit={handleSubmit}>
        <Field label="Work email" htmlFor="forgot-email">
          <input
            id="forgot-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <button className="btn btn-primary btn-lg w-full" type="submit" disabled={submitting}>
          {submitting ? <Spinner size={16} /> : <Mail size={16} />}
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      {message ? <div className="disclosure mt-3 tiny">{message}</div> : null}
      <div className="auth-foot">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
