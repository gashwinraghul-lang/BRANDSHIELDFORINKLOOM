// client/src/pages/Landing.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ShieldCheck,
  Sparkles,
  ScanText,
  Quote,
  Image as ImageIcon,
  Accessibility,
  GitCompare,
  ArrowRight,
  Lock,
  Users,
  History,
} from 'lucide-react';
import { DisclosurePanel } from '../components/ui.jsx';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

function FloatingShape({ position, scale, speed, color, geometry }) {
  const ref = useRef(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.x = t * speed * 0.25;
    ref.current.rotation.y = t * speed * 0.35;
    ref.current.position.y = position[1] + Math.sin(t * speed + position[0]) * 0.24;
  });
  return (
    <mesh ref={ref} position={position} scale={scale}>
      {geometry === 'knot' ? <torusKnotGeometry args={[0.7, 0.22, 140, 18]} /> : null}
      {geometry === 'ico' ? <icosahedronGeometry args={[1, 1]} /> : null}
      {geometry === 'octa' ? <octahedronGeometry args={[0.85, 0]} /> : null}
      {geometry === 'torus' ? <torusGeometry args={[0.8, 0.24, 20, 60]} /> : null}
      <meshStandardMaterial color={color} wireframe transparent opacity={0.55} emissive={color} emissiveIntensity={0.35} />
    </mesh>
  );
}

function Dust({ count = 420 }) {
  const ref = useRef(null);
  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 16;
      array[i * 3 + 1] = (Math.random() - 0.5) * 9;
      array[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return array;
  }, [count]);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.025;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.028} color="#9fd8ff" transparent opacity={0.65} sizeAttenuation />
    </points>
  );
}

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0.4, 7], fov: 52 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.7} />
      <pointLight position={[4, 4, 6]} intensity={40} color="#5FE3F5" />
      <pointLight position={[-5, -2, 2]} intensity={30} color="#6C5CE7" />
      <Dust />
      <FloatingShape position={[-3.4, 1.1, -1]} scale={1.25} speed={0.5} color="#6C5CE7" geometry="knot" />
      <FloatingShape position={[3.2, -0.6, -1.5]} scale={1.5} speed={0.36} color="#5FE3F5" geometry="ico" />
      <FloatingShape position={[2.3, 1.9, -2.5]} scale={0.65} speed={0.66} color="#B8A9FF" geometry="octa" />
      <FloatingShape position={[-2.6, -1.8, -2]} scale={0.75} speed={0.44} color="#5FE3F5" geometry="torus" />
    </Canvas>
  );
}

const FEATURES = [
  {
    icon: ScanText,
    title: 'Six review agents, one verdict',
    body: 'Tone, terminology, messaging, claims, visual consistency and accessibility run in parallel, then merge into one de-duplicated list of findings.',
  },
  {
    icon: Quote,
    title: 'Claims checked against evidence',
    body: 'Every factual or promotional claim is matched to an approved fact. You see the source, owner, expiry date and similarity score — or a clear “unsupported”.',
  },
  {
    icon: ImageIcon,
    title: 'Pixel-level image review',
    body: 'Palette compliance with CIEDE2000, OCR-based WCAG contrast, and logo verification. Measured values, never guesses.',
  },
  {
    icon: Sparkles,
    title: 'Corrections, not just complaints',
    body: 'Each finding carries a suggested fix that preserves the writer’s purpose, with a side-by-side diff before anything changes.',
  },
  {
    icon: Users,
    title: 'Human approval workflow',
    body: 'Creators submit, managers assign, reviewers approve or request changes. Threaded comments, @mentions, revision history and role checks on the server.',
  },
  {
    icon: GitCompare,
    title: 'Closed-loop guidelines',
    body: 'When reviewers keep overriding a rule, BrandShield drafts a clearer version, then measures the change honestly — including “not enough data to tell”.',
  },
];

const STEPS = [
  { title: 'Load your brand knowledge', body: 'Import guidelines (.txt, .md, .docx, .pdf), approved facts, preferred terminology and visual assets. Versions are immutable.' },
  { title: 'Submit content before publication', body: 'Paste text or upload a document or image. Mark it public, internal or restricted — restricted content is reviewed fully locally.' },
  { title: 'Review evidence, not opinions', body: 'Each finding cites the exact guideline version, fact or asset involved, shows confidence and engine, and suggests a correction.' },
  { title: 'Decide as a team', body: 'Accept, reject or override with a reason. Then submit for approval. Nothing is applied or published automatically.' },
];

export default function Landing() {
  const reduced = useReducedMotion();

  return (
    <div className="landing">
      {!reduced ? (
        <div className="three-wrap" aria-hidden="true">
          <Scene />
        </div>
      ) : null}

      <div className="landing-inner">
        <div className="container">
          <nav className="landing-nav">
            <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
              <div className="brand-mark">B</div>
              <div>
                <div className="brand-name">BrandShield.ai</div>
                <div className="brand-sub">by Inkloom AI</div>
              </div>
            </Link>
            <div className="row wrap">
              <a href="#how" className="btn btn-ghost btn-sm">How it works</a>
              <a href="#features" className="btn btn-ghost btn-sm">Features</a>
              <Link to="/login" className="btn btn-sm">Sign in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Get started</Link>
            </div>
          </nav>

          <section className="hero-section">
            <div className="hero-copy">
              <div className="eyebrow">Brand governance before publication</div>
              <h1 className="hero-title mt-2">
                Your brand,<br />
                <em>defended</em> before<br />
                it goes live.
              </h1>
              <p className="hero-sub">
                BrandShield reviews every post, page, pitch and banner against your approved guidelines, facts,
                terminology and assets. It explains each issue, cites its source, and proposes a correction — then a
                human decides.
              </p>
              <div className="hero-actions">
                <Link to="/signup" className="btn btn-primary btn-lg">
                  Create your workspace <ArrowRight size={17} />
                </Link>
                <Link to="/login" className="btn btn-lg">
                  Explore the demo
                </Link>
              </div>
              <div className="hero-proof">
                <div>
                  <div className="proof-num">6</div>
                  <div className="proof-label">Review agents</div>
                </div>
                <div>
                  <div className="proof-num">4</div>
                  <div className="proof-label">Claim verdicts</div>
                </div>
                <div>
                  <div className="proof-num">100%</div>
                  <div className="proof-label">Human decisions</div>
                </div>
                <div>
                  <div className="proof-num">0</div>
                  <div className="proof-label">Restricted items sent out</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="section" id="features">
          <div className="container">
            <div className="section-head">
              <div className="kicker">What it checks</div>
              <h2>Explainable by design.</h2>
              <p>
                No black-box rejection. Every finding names the rule, the source and the confidence — and every
                suggestion is yours to accept, edit or refuse.
              </p>
            </div>
            <div className="grid grid-3">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="card card-pad card-hover">
                  <div className="feature-icon"><feature.icon size={20} /></div>
                  <h3>{feature.title}</h3>
                  <p className="tiny mt-2">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="container">
            <div className="section-head">
              <div className="kicker">How it works</div>
              <h2>From draft to decision in four moves.</h2>
            </div>
            <div className="grid grid-4">
              {STEPS.map((step, index) => (
                <div key={step.title} className="stack-sm">
                  <div className="step-num">0{index + 1}</div>
                  <h3 className="mt-1">{step.title}</h3>
                  <p className="tiny">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="grid grid-2" style={{ alignItems: 'stretch' }}>
              <div className="card card-pad">
                <div className="feature-icon"><Lock size={20} /></div>
                <h3>Confidentiality is a hard boundary.</h3>
                <p className="tiny mt-2">
                  Guidelines, facts, assets and submissions each carry a confidentiality flag. Anything derived from
                  restricted material is handled by deterministic engines on your server. Emails and phone numbers are
                  redacted before any external call, and every external call is logged.
                </p>
                <div className="row wrap mt-3">
                  <span className="badge tone-green">public</span>
                  <span className="badge tone-indigo">internal</span>
                  <span className="badge tone-red">restricted · never sent out</span>
                </div>
              </div>
              <div className="card card-pad">
                <div className="feature-icon"><History size={20} /></div>
                <h3>An audit trail you can defend.</h3>
                <p className="tiny mt-2">
                  Sign-ins, knowledge changes, review runs, finding decisions, overrides with reasons, approvals and
                  guideline versions are append-only and exportable as CSV. Managers can see recurring problems and
                  unclear rules without naming and shaming individuals.
                </p>
                <div className="row wrap mt-3">
                  <span className="badge"><ShieldCheck size={12} /> Role checks on every route</span>
                  <span className="badge"><Accessibility size={12} /> WCAG AA target</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="cta-band stack">
              <div className="eyebrow">Ready when you are</div>
              <h2 style={{ maxWidth: 620 }}>Give every draft the review it deserves.</h2>
              <p style={{ maxWidth: 560 }}>
                Works with no AI key at all. When a Groq key is present, language models strengthen the review; when
                it isn&apos;t, the deterministic engines still catch tone, terminology, claims and accessibility issues.
              </p>
              <div className="row wrap mt-2">
                <Link to="/signup" className="btn btn-primary btn-lg">Create your workspace <ArrowRight size={17} /></Link>
                <Link to="/login" className="btn btn-lg">Sign in</Link>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <DisclosurePanel />
        </div>

        <footer className="landing-footer">
          <div className="container row-between wrap">
            <span>BrandShield.ai by Inkloom AI</span>
            <span className="row wrap" style={{ gap: 16 }}>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <Link to="/login">Sign in</Link>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
