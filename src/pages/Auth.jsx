import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

function ForgeMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2 L20 7 V13 C20 17.5 16.7 20.7 12 22 C7.3 20.7 4 17.5 4 13 V7 L12 2 Z"
        fill="#f59e0b" />
      <path d="M8.5 12.2 L11.2 14.8 L15.7 9.6" stroke="#111418" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function BrandPanel({ mode }) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden bg-ink-950 px-8 py-10 text-white sm:px-10 lg:px-12">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(560px 300px at 85% 0%, rgba(245,158,11,0.20), transparent 62%), radial-gradient(480px 320px at 8% 100%, rgba(245,158,11,0.10), transparent 60%)',
        }}
      />
      <div className="relative">
        <Link to="/" className="flex items-center gap-2.5" aria-label="FlowForge home">
          <ForgeMark className="h-9 w-9" />
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">FlowForge</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Control room</span>
          </span>
        </Link>
        <p className="mt-10 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-forge-400">
          {mode === 'login' ? 'Control room · sign in' : 'Control room · new operator'}
        </p>
        <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {mode === 'login' ? 'Back to the forge floor.' : 'Light your first forge.'}
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-300">
          {mode === 'login'
            ? 'Sign in to build, run, and inspect visual workflows with NVIDIA Nemotron inside.'
            : 'Free forever tier — Supabase Auth secures every workflow, trigger to execution.'}
        </p>
        <ul className="mt-8 space-y-3 text-sm leading-relaxed text-ink-200">
          {[
            'Drag-drop nodes on a dotted-grid canvas.',
            'Condition, loop, transform, and AI nodes included.',
            'Every execution logged with retry + variable trace.',
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <svg className="mt-0.5 shrink-0 text-forge-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative mt-10 font-mono text-[11px] tracking-wide text-ink-500">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-forge-500 align-middle" aria-hidden="true" />
        React + Vercel + Supabase · NVIDIA Nemotron inside
      </p>
    </div>
  );
}

function AuthShell({ mode, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel mode={mode} />
      <div className="relative flex items-center justify-center bg-paper px-4 py-10 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(520px 280px at 85% 0%, rgba(245,158,11,0.12), transparent 60%), radial-gradient(420px 300px at 10% 100%, rgba(17,20,24,0.06), transparent 60%)',
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-ink-800/10 bg-white p-1 text-sm font-semibold shadow-card">
            <Link
              to="/login"
              aria-current={mode === 'login' ? 'page' : undefined}
              className={`rounded-lg py-2 text-center transition ${mode === 'login' ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-paper hover:text-ink-900'}`}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              aria-current={mode === 'signup' ? 'page' : undefined}
              className={`rounded-lg py-2 text-center transition ${mode === 'signup' ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-paper hover:text-ink-900'}`}
            >
              Sign up
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthForm({ mode }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const fn = mode === 'login' ? signIn : signUp;
      const { data, error } = await fn(email, password);
      if (error) throw error;
      if (mode === 'signup' && !data.session) {
        setInfo('Account created. Check your email to confirm, then sign in — one account works on every app.');
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      const msg = err.message || 'Something went wrong.';
      if (mode === 'signup' && /already (registered|exists|been registered)/i.test(msg)) {
        setInfo('This email already has an account — one account works on every app. Sign in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell mode={mode}>
      <div className="page-enter w-full overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 text-white shadow-card">
        <div className="border-b border-ink-800 px-8 pb-5 pt-7">
          <div className="flex items-center gap-2.5">
            <ForgeMark className="h-9 w-9" />
            <div>
              <div className="text-sm font-bold tracking-tight">FlowForge</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Control room</div>
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-ink-300">
            {mode === 'login' ? 'Sign in to build and run workflows.' : 'Free forever tier — Supabase Auth secures every workflow.'}
          </p>
        </div>
        <div className="space-y-4 px-8 py-6">
          {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
          {info && (
            <div className="rounded-lg border border-forge-500/40 bg-forge-500/10 p-3 text-sm text-forge-200">
              {info}{' '}
              <Link to="/login" className="font-semibold text-forge-300 underline-offset-2 hover:underline">Sign in</Link>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink-300" htmlFor={`email-${mode}`}>Email</label>
              <input id={`email-${mode}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink-300" htmlFor={`password-${mode}`}>Password</label>
              <input id={`password-${mode}`} type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30"
                placeholder="Enter your password" />
            </div>
            <button disabled={busy}
              className="btn-press w-full rounded-lg bg-forge-500 py-2 text-sm font-semibold text-ink-950 hover:bg-forge-400 disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          </form>
          <p className="text-center text-sm text-ink-300">
            {mode === 'login' ? (
              <>No account? <Link to="/signup" className="font-semibold text-forge-400 hover:text-forge-300">Sign up</Link></>
            ) : (
              <>Have an account? <Link to="/login" className="font-semibold text-forge-400 hover:text-forge-300">Sign in</Link></>
            )}
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export function Login() {
  return <AuthForm mode="login" />;
}

export function Signup() {
  return <AuthForm mode="signup" />;
}
