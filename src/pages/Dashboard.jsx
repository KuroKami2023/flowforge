import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { DEMO_WORKFLOWS } from '../lib/demoWorkflows.js';

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Stat({ label, value, accent, sub }) {
  return (
    <div className="card-lift rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className={`tnum mt-1 text-3xl font-bold tracking-tight text-ink-950 ${accent || ''}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const cls = status === 'success'
    ? 'bg-emerald-100 text-emerald-800'
    : status === 'failed'
      ? 'bg-red-100 text-red-700'
      : 'bg-forge-100 text-forge-800';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [loadingDemo, setLoadingDemo] = useState('');
  const [aiPrompt, setAiPrompt] = useState('Say hello in one sentence.');
  const [aiResult, setAiResult] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api.dashboardStats().then((d) => {
      setStats(d?.stats || null);
      setRecent(d?.recentExecutions || []);
    }).catch((e) => setError(e.message));
  }, []);

  const loadDemo = async (demo) => {
    setLoadingDemo(demo.key);
    setError('');
    try {
      const created = await api.createWorkflow({
        name: demo.name,
        description: demo.description,
        definition: demo.definition,
        enabled: true
      });
      if (!created?.workflow?.id) throw new Error('Create returned no data.');
      navigate(`/workflows/${created.workflow.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDemo('');
    }
  };

  const testAi = async () => {
    setAiBusy(true);
    setAiResult('');
    try {
      const r = await api.testAi({ prompt: aiPrompt, maxTokens: 256 });
      setAiResult(typeof r?.text === 'string' && r.text ? r.text : JSON.stringify(r));
    } catch (e) {
      setAiResult(`Error: ${e.message}`);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-forge-700">Control room</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-950">Dashboard</h1>
          <p className="text-sm text-ink-500">Orchestrate visual workflows with NVIDIA Nemotron inside.</p>
        </div>
        <Link to="/workflows"
          className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-ink-800">
          <PlusIcon className="h-4 w-4 text-forge-400" />
          New workflow
        </Link>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Workflows" value={stats?.totalWorkflows ?? '—'} />
        <Stat label="Active" value={stats?.activeWorkflows ?? '—'} accent="text-emerald-600" />
        <Stat label="Executions" value={stats?.totalExecutions ?? '—'} />
        <Stat label="Succeeded" value={stats?.successfulExecutions ?? '—'} accent="text-emerald-600" />
        <Stat label="Failed" value={stats?.failedExecutions ?? '—'} accent="text-red-600" />
        <Stat label="Avg time" value={stats && typeof stats.averageExecutionMs === 'number' ? `${(stats.averageExecutionMs / 1000).toFixed(1)}s` : '—'} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
          <h2 className="font-bold tracking-tight text-ink-950">Demo workflows</h2>
          <p className="mb-4 text-sm text-ink-500">One click creates a workflow that actually executes.</p>
          <div className="stagger space-y-3">
            {DEMO_WORKFLOWS.map((d) => (
              <div key={d.key} className="card-lift flex items-center gap-3 rounded-lg border border-ink-100 bg-paper p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-950 text-sm font-bold text-forge-400" aria-hidden="true">
                  {d.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink-900">
                    {d.name}{' '}
                    {d.needsAi && (
                      <span className="rounded-full bg-forge-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-forge-800">
                        AI
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-ink-500">{d.description}</div>
                </div>
                <button
                  onClick={() => loadDemo(d)}
                  disabled={loadingDemo !== ''}
                  className="btn-press shrink-0 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:border-forge-400 hover:bg-forge-50 disabled:opacity-50"
                >
                  {loadingDemo === d.key ? 'Creating…' : 'Load demo'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-bold tracking-tight text-ink-950">Recent executions</h2>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live
              </span>
            </div>
            {recent.length === 0 && <p className="text-sm text-ink-500">No runs yet — open a workflow and press Run.</p>}
            <div className="divide-y divide-ink-100">
              {recent.map((e) => (
                <Link key={e.id} to={`/executions/${e.id}`}
                  className="row-hover flex items-center gap-3 py-2.5 text-sm hover:bg-paper">
                  <StatusPill status={e.status} />
                  <span className="tnum font-mono text-xs text-ink-500">{String(e.id || '').slice(0, 8)}</span>
                  <span className="text-xs text-ink-400">{e.trigger_type}</span>
                  <span className="tnum ml-auto text-xs text-ink-400">{e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(1)}s` : ''}</span>
                </Link>
              ))}
            </div>
            <Link to="/executions"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-forge-700 hover:text-forge-600">
              View all <ArrowIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-white shadow-card">
            <div className="border-b border-ink-800 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-forge-500" aria-hidden="true" />
                <h2 className="font-bold tracking-tight">Test Nemotron</h2>
              </div>
              <p className="mt-1 text-xs text-ink-300">
                Calls <span className="font-mono text-forge-300">nvidia/nemotron-3-nano-omni-30b-a3b-reasoning</span> via the server — the key never reaches the browser.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2}
                className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30" />
              <button onClick={testAi} disabled={aiBusy}
                className="btn-press rounded-lg bg-forge-500 px-4 py-1.5 text-sm font-semibold text-ink-950 hover:bg-forge-400 disabled:opacity-50">
                {aiBusy ? 'Thinking…' : 'Ask Nemotron'}
              </button>
              {aiResult && <pre className="whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-900 p-3 text-xs leading-relaxed text-ink-100">{aiResult}</pre>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
