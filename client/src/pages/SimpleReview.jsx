// client/src/pages/SimpleReview.jsx
import { useState } from 'react';

export default function SimpleReview() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [text, setText] = useState('');
  const [findings, setFindings] = useState([]);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) throw new Error(`Login failed: ${res.status}`);
      // login succeeded – csrf cookie set by server
      setLoggedIn(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(^|;)\s*bs_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[2]) : '';
  }

  async function handleReview() {
    setError(null);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Review failed: ${res.status}`);
      const data = await res.json();
      // attach UI status field
      const withStatus = data.findings.map(f => ({ ...f, uiStatus: 'open' }));
      setFindings(withStatus);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleStatus(id, newStatus) {
    setFindings(prev =>
      prev.map(f => (f.id === id ? { ...f, uiStatus: newStatus } : f))
    );
  }

  const darkStyles = {
    background: '#070E17',
    color: '#fff',
    minHeight: '100vh',
    padding: '1rem',
  };

  const severityColors = {
    medium: '#F5B942',
    high: '#FF6B6B',
  };

  return (
    <div style={darkStyles}>
      <h1 style={{ color: '#6C5CE7' }}>BrandShield Review Demo</h1>
      {!loggedIn ? (
        <form onSubmit={handleLogin} style={{ marginBottom: '1rem' }}>
          <div>
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ marginLeft: '0.5rem' }}
            />
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ marginLeft: '0.5rem' }}
            />
          </div>
          <button type="submit" style={{ marginTop: '0.5rem' }}>
            Sign in
          </button>
          {error && <div style={{ color: '#FF6B6B' }}>{error}</div>}
        </form>
      ) : (
        <div>
          <textarea
            rows={6}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter text to review..."
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button onClick={handleReview}>Review</button>
        </div>
      )}

      {findings.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Findings</h2>
          {findings.map(f => (
            <div
              key={f.id}
              style={{
                border: `2px solid ${severityColors[f.severity] || '#fff'}`,
                padding: '0.5rem',
                marginBottom: '0.5rem',
                background: '#0C1A2A',
                color: '#fff',
              }}
            >
              <strong style={{ color: severityColors[f.severity] }}>
                {f.category} ({f.severity})
              </strong>
              <div>Matched: {f.matchedText}</div>
              <div>{f.explanation}</div>
              <div>Suggestion: {f.suggestion}</div>
              <div>
                Status: {f.uiStatus}{' '}
                {f.uiStatus !== 'accepted' && (
                  <button onClick={() => toggleStatus(f.id, 'accepted')}>Accept</button>
                )}
                {f.uiStatus !== 'rejected' && (
                  <button onClick={() => toggleStatus(f.id, 'rejected')}>Reject</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
