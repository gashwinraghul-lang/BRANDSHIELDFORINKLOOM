// client/src/components/AuthLayout.jsx
import { Link } from 'react-router-dom';
import { ShieldCheck, Quote, Lock, Sparkles } from 'lucide-react';

export default function AuthLayout({ children }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-story">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">BrandShield.ai</div>
            <div className="brand-sub">by Inkloom AI</div>
          </div>
        </Link>

        <div className="stack" style={{ maxWidth: 470 }}>
          <div className="eyebrow">Brand governance, before publication</div>
          <h1 style={{ fontSize: 'clamp(2.1rem, 3.8vw, 3.4rem)' }}>
            Nothing goes live <em style={{ color: 'var(--cyan)', fontStyle: 'italic' }}>unvetted.</em>
          </h1>
          <p style={{ fontSize: '1.02rem' }}>
            Review content against your approved guidelines, facts, terminology and assets. Every issue cites its source
            and comes with a correction that keeps the writer&apos;s intent.
          </p>

          <div className="stack-sm" style={{ marginTop: 10 }}>
            {[
              { icon: ShieldCheck, text: 'Tone, terminology, messaging, claims, visual and accessibility checks' },
              { icon: Sparkles, text: 'Evidence-grounded claim checking with sources, owners and expiry dates' },
              { icon: Quote, text: 'Humans accept, reject or override every suggestion — with a reason on record' },
              { icon: Lock, text: 'Restricted brand material never leaves your server' },
            ].map((item) => (
              <div key={item.text} className="row" style={{ alignItems: 'flex-start' }}>
                <item.icon size={16} style={{ color: 'var(--cyan)', marginTop: 3, flex: 'none' }} />
                <span className="tiny" style={{ color: 'var(--text-2)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tiny muted">
          BrandShield.ai by Inkloom AI · AI-assisted, human-decided.
        </div>
      </aside>

      <section className="auth-form-side">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}
