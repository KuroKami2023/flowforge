import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function Workflows() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const refresh = () => {
    api.listWorkflows().then((d) => setWorkflows(d?.workflows || [])).catch((e) => setError(e.message));
  };

  useEffect(refresh, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const r = await api.createWorkflow({
        name: name.trim(),
        description: '',
        definition: { nodes: [], connections: [] },
        enabled: true
      });
      if (!r?.workflow?.id) throw new Error('Create returned no data.');
      navigate(`/workflows/${r.workflow.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (w) => {    try {
      await api.updateWorkflow(w.id, { enabled: !w.enabled });
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const duplicate = async (w) => {
    try {
      const r = await api.duplicateWorkflow(w.id);
      if (!r?.workflow?.id) throw new Error('Duplicate returned no data.');
      navigate(`/workflows/${r.workflow.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete "${w.name}" and all its executions?`)) return;
    try {
      await api.deleteWorkflow(w.id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page-enter space-y-6">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-forge-700">Forge floor</div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink-950">Workflows</h1>
          <span className="tnum rounded-full bg-ink-950 px-2.5 py-0.5 text-xs font-semibold text-forge-300">
            {workflows.length} total
          </span>
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={create}
        className="flex gap-2 rounded-xl border border-ink-100 bg-white p-2 shadow-card focus-within:border-forge-400 focus-within:ring-2 focus-within:ring-forge-500/20">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a new workflow, then press Create…"
          className="flex-1 bg-transparent px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 outline-none" />
        <button className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800">
          <PlusIcon className="h-4 w-4 text-forge-400" />
          Create
        </button>
      </form>

      <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((w) => (
          <div key={w.id} className="card-lift space-y-2 rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0" title={w.enabled ? 'Enabled' : 'Disabled'}>
                <span className={`absolute inline-flex h-full w-full rounded-full ${w.enabled ? 'bg-emerald-500' : 'bg-ink-200'}`} aria-hidden="true" />
              </span>
              <Link to={`/workflows/${w.id}`} className="truncate font-bold tracking-tight text-ink-950 hover:text-forge-700">{w.name}</Link>
              <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${w.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-500'}`}>
                {w.enabled ? 'Live' : 'Off'}
              </span>
            </div>
            <div className="tnum font-mono text-xs text-ink-400">{String(w.id || '').slice(0, 8)} · updated {w.updated_at ? new Date(w.updated_at).toLocaleString() : '—'}</div>
            <div className="flex flex-wrap gap-2 pt-2 text-xs font-medium">
              <Link to={`/workflows/${w.id}`}
                className="btn-press rounded-md bg-ink-950 px-2.5 py-1.5 text-white hover:bg-ink-800">Open</Link>
              <button onClick={() => toggle(w)}
                className="btn-press rounded-md border border-ink-200 px-2.5 py-1.5 text-ink-700 hover:border-forge-400 hover:bg-forge-50">
                {w.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => duplicate(w)}
                className="btn-press rounded-md border border-ink-200 px-2.5 py-1.5 text-ink-700 hover:border-forge-400 hover:bg-forge-50">
                Duplicate
              </button>
              <button onClick={() => remove(w)}
                className="btn-press rounded-md border border-ink-200 px-2.5 py-1.5 text-red-600 hover:border-red-300 hover:bg-red-50">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {workflows.length === 0 && (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 p-8 text-center">
          <p className="text-sm font-medium text-ink-600">No workflows yet</p>
          <p className="mt-1 text-sm text-ink-400">Create one above or load a demo from the dashboard.</p>
        </div>
      )}
    </div>
  );
}
