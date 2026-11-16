// client/src/App.jsx
import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';

import AppShell from './components/AppShell.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Submissions from './pages/Submissions.jsx';
import NewReview from './pages/NewReview.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Insights from './pages/Insights.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';
import Evaluation from './pages/Evaluation.jsx';
import NotFound from './pages/NotFound.jsx';
import ReviewLayout from './pages/review/ReviewLayout.jsx';
import SimpleReview from './pages/SimpleReview.jsx';
import ReviewFindings from './pages/review/ReviewFindings.jsx';
import ReviewClaims from './pages/review/ReviewClaims.jsx';
import ReviewApproval from './pages/review/ReviewApproval.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}

function LoadingScreen() {
  return (
    <div
      className="stack-sm"
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}
      role="status"
      aria-live="polite"
    >
      <Spinner size={24} />
      <span className="tiny">Checking your session…</span>
    </div>
  );
}

function ProtectedRoute() {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

function PublicOnly() {
  const { isAuthed, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (isAuthed) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
          <Route path="/simple-review" element={<SimpleReview />} />
        <Route path="/" element={<Landing />} />

        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="submissions" element={<Submissions />} />
            <Route path="reviews/new" element={<NewReview />} />
            <Route path="reviews/:id" element={<ReviewLayout />}>
              <Route index element={<ReviewFindings />} />
              <Route path="claims" element={<ReviewClaims />} />
              <Route path="approval" element={<ReviewApproval />} />
            </Route>
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="insights" element={<Insights />} />
            <Route path="audit" element={<Audit />} />
            <Route path="settings" element={<Settings />} />
            <Route path="evaluation" element={<Evaluation />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
