import { Link, useNavigate, useLocation } from 'react-router-dom';
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

function NavIcon({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { to: '/workflows', label: 'Workflows', icon: 'M6 6a2.5 2.5 0 1 0 0-.01M18 6a2.5 2.5 0 1 0 0-.01M12 18a2.5 2.5 0 1 0 0-.01M8 7h8M6.5 8.5 11 15.5M17.5 8.5 13 15.5' },
  { to: '/executions', label: 'Executions', icon: 'M3 12h4l2.5-6 4 12L16 12h5' }
];

function isActive(pathname, to) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(to + '/');
}

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Public pages render in their own chrome, not the app shell.
  if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/signup') {
    return <>{children}</>;
  }

  const navLink = (item) => {
    const active = isActive(location.pathname, item.to);
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={`btn-press group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? 'bg-forge-500/15 text-forge-300 shadow-[inset_2px_0_0_0_#f59e0b]'
            : 'text-ink-300 hover:bg-ink-800 hover:text-white'
        }`}
      >
        <NavIcon d={item.icon} className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-forge-400' : 'text-ink-400 group-hover:text-ink-200'}`} />
        <span className="truncate">{item.label}</span>
        {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-forge-500" aria-hidden="true" />}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-paper text-ink-900 md:flex">
      {/* ------- mobile top chrome (dark) ------- */}
      <header className="sticky top-0 z-40 bg-ink-950 text-white md:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <ForgeMark className="h-7 w-7" />
            <span className="tracking-tight">FlowForge</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <button
                onClick={async () => { await signOut(); navigate('/login'); }}
                className="btn-press rounded-md border border-ink-700 px-2.5 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-800"
              >
                Sign out
              </button>
            ) : (
              <>
                <Link to="/login" className="px-2 py-1.5 text-xs text-ink-200">Sign in</Link>
                <Link to="/signup" className="btn-press rounded-md bg-forge-500 px-2.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-forge-400">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
        {user && (
          <nav className="flex gap-1 overflow-x-auto border-t border-ink-800 px-3 py-2" aria-label="Primary">
            {NAV.map((item) => {
              const active = isActive(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`btn-press flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                    active ? 'bg-forge-500 text-ink-950' : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                  }`}
                >
                  <NavIcon d={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* ------- desktop sidebar (dark control room) ------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink-950 text-white md:flex">
        <Link to="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <ForgeMark className="h-9 w-9" />
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">FlowForge</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Control room</span>
          </span>
        </Link>
        {user && (
          <nav className="ff-dark-scroll flex-1 space-y-1 overflow-y-auto px-3" aria-label="Primary">
            <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">Operate</div>
            {NAV.map(navLink)}
          </nav>
        )}
        <div className="border-t border-ink-800 p-4">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-forge-300" aria-hidden="true">
                  {(user.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate text-xs text-ink-300" title={user.email}>{user.email}</span>
              </div>
              <button
                onClick={async () => { await signOut(); navigate('/login'); }}
                className="btn-press flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-800 hover:text-white"
              >
                <NavIcon d="M15 12H4m0 0 4-4m-4 4 4 4M10 4h9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-9" className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link to="/login" className="btn-press rounded-md border border-ink-700 px-3 py-1.5 text-center text-xs font-medium text-ink-200 hover:bg-ink-800">
                Sign in
              </Link>
              <Link to="/signup" className="btn-press rounded-md bg-forge-500 px-3 py-1.5 text-center text-xs font-semibold text-ink-950 hover:bg-forge-400">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* ------- content ------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {user && (
          <div className="hidden items-center gap-2 border-b border-ink-100 bg-paper px-6 py-2 text-[11px] font-medium text-ink-400 md:flex" aria-hidden="true">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Forge online
            <span className="text-ink-200">/</span>
            <span className="truncate">{user.email}</span>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-xs text-ink-400 md:px-6">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-forge-500 align-middle" aria-hidden="true" />
          FlowForge, visual workflow automation, NVIDIA Nemotron inside, React plus Vercel plus Supabase
        </footer>
      </div>
    </div>
  );
}

