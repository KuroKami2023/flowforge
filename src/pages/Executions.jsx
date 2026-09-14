import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

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

export function Executions() {
  const [executions, setExecutions] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listExecutions(status ? { status } : {})
      .then((d) => setExecutions(d?.executions || []))
      .catch((e) => setError(e.message));
  }, [status]);

  return (
    <div className="page-enter space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-forge-700">Run log</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-950">Executions</h1>
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-500">
          Filter
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30">
            <option value="">All statuses</option>
            <option value="success">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </label>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
        <div className="stagger divide-y divide-ink-100">
          {executions.map((e) => (
            <Link key={e.id} to={`/executions/${e.id}`}
              className="row-hover flex items-center gap-3 px-4 py-3 text-sm hover:bg-paper">
              <StatusPill status={e.status} />
              <span className="truncate font-semibold text-ink-900">{e.workflow_name || 'Untitled workflow'}</span>
              <span className="tnum hidden font-mono text-xs text-ink-400 sm:inline">{String(e.id || '').slice(0, 8)}</span>
              <span className="hidden text-xs text-ink-400 md:inline">{e.trigger_type}</span>
              <span className="tnum ml-auto shrink-0 text-xs text-ink-400">
                {e.started_at ? new Date(e.started_at).toLocaleString() : '—'} · {e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(1)}s` : ''}
              </span>
            </Link>
          ))}
          {executions.length === 0 && <p className="p-6 text-center text-sm text-ink-400">No executions found.</p>}
        </div>
      </div>
    </div>
  );
}

export function ExecutionDetail() {
  const id = window.location.pathname.split('/').pop();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [openNode, setOpenNode] = useState(null);

  const load = () => {
    api.getExecution(id).then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, [id]);

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await api.retryExecution(id);
      if (!r?.executionId) throw new Error('Retry returned no data.');
      window.location.href = `/executions/${r.executionId}`;
    } catch (e) {
      setError(e.message);
    } finally {
      setRetrying(false);
    }
  };

  const downloadCsv = (node) => {
    const csv = node.output?.csv;
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = node.output?.filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!data) {
    return (
      <div className="page-enter space-y-3 p-2" aria-label="Loading execution">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
        <div className="skeleton h-48" />
      </div>
    );
  }

  const execution = data?.execution || {};
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const workflowName = data?.workflowName || 'Run report';

  return (
    <div className="page-enter space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-forge-700">Run report</div>
          <h1 className="text-xl font-bold tracking-tight text-ink-950">{workflowName}</h1>
        </div>
        <StatusPill status={execution.status} />
        <span className="tnum font-mono text-xs text-ink-400">{execution.id}</span>
        {execution.status === 'failed' && (
          <button onClick={retry} disabled={retrying}
            className="btn-press ml-auto rounded-lg bg-ink-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50">
            {retrying ? 'Retrying…' : 'Retry from failed node'}
          </button>
        )}
      </div>

      <div className="stagger grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-card"><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Trigger</div><div className="mt-0.5 font-semibold text-ink-900">{execution.trigger_type}</div></div>
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-card"><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Started</div><div className="tnum mt-0.5 font-semibold text-ink-900">{new Date(execution.started_at).toLocaleString()}</div></div>
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-card"><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Duration</div><div className="tnum mt-0.5 font-semibold text-ink-900">{execution.duration_ms != null ? `${(execution.duration_ms / 1000).toFixed(2)}s` : '—'}</div></div>
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-card"><div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Nodes</div><div className="tnum mt-0.5 font-semibold text-ink-900">{nodes.length}</div></div>
      </div>

      {execution.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">Error: </span>{execution.error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card">
        <div className="border-b border-ink-100 bg-ink-950 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-forge-300">
          Node results · debug output
        </div>
        <div className="divide-y divide-ink-100">
          {nodes.map((n) => (
            <div key={n.id} className="px-4 py-3">
              <button onClick={() => setOpenNode(openNode === n.id ? null : n.id)}
                aria-expanded={openNode === n.id}
                className="row-hover flex w-full items-center gap-2 rounded-md text-left text-sm hover:bg-paper">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                <span className="font-mono font-semibold text-ink-900">{n.node_id}</span>
                <span className="text-xs text-ink-400">{n.node_type}</span>
                <span className="tnum ml-auto text-xs text-ink-400">{n.attempts} attempt(s) · {n.duration_ms}ms</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${openNode === n.id ? 'rotate-180' : ''}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {n.error && <div className="mt-1 text-xs text-red-600">{n.error}</div>}
              {openNode === n.id && (
                <div className="mt-2">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-950 p-3 text-xs leading-relaxed text-ink-100">
                    {JSON.stringify(n.output, null, 2)}
                  </pre>
                  {n.output?.csv && (
                    <button onClick={() => downloadCsv(n)}
                      className="btn-press mt-2 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-forge-400 hover:bg-forge-50">
                      Download CSV
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {nodes.length === 0 && <p className="p-4 text-sm text-ink-400">No node records.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Final output</div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-100 bg-paper p-3 text-xs leading-relaxed text-ink-800">{JSON.stringify(execution.output, null, 2)}</pre>
      </div>
    </div>
  );
}
