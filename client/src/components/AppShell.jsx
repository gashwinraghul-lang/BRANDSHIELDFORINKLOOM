// client/src/components/AppShell.jsx
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  BarChart3,
  History,
  Settings as SettingsIcon,
  FlaskConical,
  Plus,
  Menu,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { initials } from '../lib/format.js';
import { Spinner } from './ui.jsx';

const NAV = [
  { section: 'Workspace', items: [
    { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/app/submissions', label: 'Submissions', icon: FileText },
    { to: '/app/reviews/new', label: 'New review', icon: Plus },
  ] },
  { section: 'Governance', items: [
    { to: '/app/knowledge', label: 'Brand knowledge', icon: BookOpen },
    { to: '/app/insights', label: 'Insights', icon: BarChart3 },
    { to: '/app/audit', label: 'Audit log', icon: History, roles: ['admin', 'manager'] },
    { to: '/app/evaluation', label: 'Evaluation', icon: FlaskConical },
  ] },
  { section: 'Admin', items: [
    { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
  ] },
];

const TITLES = [
  [/^\/app$/, 'Overview'],
  [/^\/app\/submissions$/, 'Submissions'],
  [/^\/app\/reviews\/new$/, 'New review'],
  [/^\/app\/reviews\/[^/]+$/, 'Review workspace'],
  [/^\/app\/reviews\/[^/]+\/claims$/, 'Claim checking'],
  [/^\/app\/reviews\/[^/]+\/approval$/, 'Approval workflow'],
  [/^\/app\/knowledge$/, 'Brand knowledge base'],
  [/^\/app\/insights$/, 'Governance insights'],
  [/^\/app\/audit$/, 'Audit log'],
  [/^\/app\/settings$/, 'Settings'],
  [/^\/app\/evaluation$/, 'Evaluation'],
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const title = useMemo(() => {
    const match = TITLES.find(([pattern]) => pattern.test(location.pathname));
    return match ? match[1] : 'BrandShield';
  }, [location.pathname]);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast(err.message || 'Could not sign out', 'error');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/app" className="brand" style={{ textDecoration: 'none' }}>
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">BrandShield.ai</div>
            <div className="brand-sub">by Inkloom AI</div>
          </div>
        </NavLink>

        <nav className="stack-sm" style={{ gap: 0 }} aria-label="Main navigation">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="nav-label">{group.section}</div>
              <div className="nav">
                {group.items
                  .filter((item) => !item.roles || item.roles.includes(user?.role))
                  .map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot stack-sm">
          <div className="tiny muted" style={{ padding: '0 8px' }}>
            <Sparkles size={12} style={{ display: 'inline', marginRight: 5, color: 'var(--cyan)' }} />
            AI-assisted, human-decided.
          </div>
          <div className="user-chip">
            <div className="avatar">{initials(user?.name || user?.email)}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="tiny truncate" style={{ color: '#fff', fontWeight: 600 }}>
                {user?.name || user?.email}
              </div>
              <div className="tiny muted truncate" style={{ textTransform: 'capitalize' }}>
                {user?.role} · {user?.organizationName}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={handleLogout} title="Sign out" aria-label="Sign out">
              {signingOut ? <Spinner size={15} /> : <LogOut size={15} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-icon mobile-toggle" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu size={18} />
            </button>
            <div className="topbar-title">{title}</div>
          </div>
          <div className="row wrap">
            <span className="tiny muted" style={{ display: 'none' }}>{user?.organizationName}</span>
            <NavLink to="/app/reviews/new" className="btn btn-primary btn-sm">
              <Plus size={14} /> New review
            </NavLink>
          </div>
        </header>
        <main className="page grow">
          <Outlet />
        </main>
        <footer className="container" style={{ paddingBottom: 26, color: 'var(--muted)', fontSize: '0.78rem' }}>
          BrandShield.ai by Inkloom AI · Findings are suggestions, never automatic decisions ·{' '}
          <NavLink to="/app/settings">AI &amp; confidentiality details</NavLink>
        </footer>
      </div>
    </div>
  );
}
