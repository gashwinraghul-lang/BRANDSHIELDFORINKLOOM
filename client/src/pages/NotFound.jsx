// client/src/pages/NotFound.jsx
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '60px 20px' }}>
      <div className="card card-pad center stack-sm" style={{ maxWidth: 480 }}>
        <Compass size={30} style={{ color: 'var(--cyan)', margin: '0 auto' }} />
        <h1 style={{ fontSize: '2.4rem' }}>Page not found.</h1>
        <p className="tiny muted">The link may be old, or the page may have moved. Your reviews and knowledge base are safe.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to="/app">Back to the workspace</Link>
          <Link className="btn" to="/">Landing page</Link>
        </div>
      </div>
    </div>
  );
}
