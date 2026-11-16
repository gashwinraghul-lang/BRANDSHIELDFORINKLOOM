// client/src/pages/VerifyEmail.jsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, AlertTriangle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Spinner } from '../components/ui.jsx';
import { endpoints } from '../api/client.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ loading: true, error: null });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, error: 'This link is missing its verification token.' });
      return;
    }
    endpoints
      .verifyEmail(token)
      .then(() => setState({ loading: false, error: null }))
      .catch((err) => setState({ loading: false, error: err.message || 'Could not verify this link.' }));
  }, [token]);

  return (
    <AuthLayout>
      <div className="eyebrow mb-2">Email verification</div>
      <h2>{state.loading ? 'Checking your link…' : state.error ? 'That link did not work.' : 'Email verified.'}</h2>
      {state.loading ? (
        <div className="row mt-3"><Spinner /> <span className="tiny muted">One moment.</span></div>
      ) : state.error ? (
        <div className="stack-sm mt-3">
          <div className="row" style={{ color: 'var(--amber)' }}>
            <AlertTriangle size={16} /> <span className="tiny">{state.error}</span>
          </div>
          <p className="tiny muted">Verification links expire after 24 hours. Sign in and request a new one.</p>
          <Link className="btn btn-primary w-full" to="/login">Go to sign in</Link>
        </div>
      ) : (
        <div className="stack-sm mt-3">
          <div className="row" style={{ color: 'var(--green)' }}>
            <BadgeCheck size={18} /> <span className="tiny">Your email address is confirmed.</span>
          </div>
          <Link className="btn btn-primary w-full" to="/login">Sign in</Link>
        </div>
      )}
    </AuthLayout>
  );
}
