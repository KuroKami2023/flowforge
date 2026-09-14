import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  applyNodeChanges, applyEdgeChanges, addEdge, MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../lib/api.js';
import { NODE_DEFINITIONS, CATEGORY_ORDER, PALETTE, newNodeId } from '../lib/nodeDefinitions.js';
import ConfigPanel from '../components/ConfigPanel.jsx';

function PlayIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function BackIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 12H5m6 6-6-6 6-6" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function NodeStatusIcon({ status, className }) {
  if (status === 'failed') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
        strokeLinecap="round" className={className} aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  }
  return null;
}

function SourceHandles({ node }) {
  const def = NODE_DEFINITIONS[node.type];
  if (def?.handles?.outputs === 'dynamic') {
    const cases = node.config?.cases || [];
    return (
      <div className="flex flex-col gap-1 mt-2">
        {cases.map((c) => (
          <div key={c.id || c.value} className="relative flex items-center justify-end text-[10px] text-gray-500 pr-3">
            {c.id || c.value || '?'}
            <Handle type="source" position={Position.Right} id={c.id || String(c.value)} style={{ top: '50%' }} />
          </div>
        ))}
        <div className="relative flex items-center justify-end text-[10px] text-gray-500 pr-3">
          default
          <Handle type="source" position={Position.Right} id="default" style={{ top: '50%' }} />
        </div>
      </div>
    );
  }
  if (Array.isArray(def?.handles?.outputs)) {
    return (
      <>
        {def.handles.outputs.map((h) => (
          <Handle key={h} type="source" position={Position.Right} id={h}
            style={{ top: h === 'true' ? '35%' : '65%', background: h === 'true' ? '#16a34a' : '#dc2626' }} />
        ))}
      </>
    );
  }
  return <Handle type="source" position={Position.Right} />;
}

function ForgeNode({ data }) {
  const def = NODE_DEFINITIONS[data.nodeType] || {};
  const border = data.status === 'failed' ? 'border-red-500' : data.status === 'success' ? 'border-emerald-500' : 'border-ink-200';
  return (
    <div className={`ff-node bg-white shadow-card border-2 ${border} min-w-[170px] max-w-[210px]`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1 text-white text-[11px] font-bold px-2 py-1 truncate" style={{ background: def.color || '#555' }}>
        <NodeStatusIcon status={data.status} className="h-3 w-3 shrink-0" />
        <span className="truncate">{def.label || data.nodeType}</span>
      </div>
      <div className="px-2 py-1 text-[11px] font-mono text-gray-500 truncate">{data.nodeId}</div>
      <SourceHandles node={data.graphNode} />
    </div>
  );
}

const nodeTypes = { forge: ForgeNode };

function toReactFlow(definition, runStatuses = {}) {
  const nodes = (definition.nodes || []).map((n) => ({
    id: n.id,
    type: 'forge',
    position: n.position || { x: 0, y: 0 },
    data: { nodeId: n.id, nodeType: n.type, status: runStatuses[n.id]?.status || null, graphNode: n }
  }));
  const edges = (definition.connections || []).map((c, i) => ({
    id: `e${i}_${c.from}_${c.to}_${c.sourceHandle || 'x'}`,
    source: c.from,
    target: c.to,
    ...(c.sourceHandle ? { sourceHandle: c.sourceHandle } : {}),
    label: c.sourceHandle || '',
    markerEnd: { type: MarkerType.ArrowClosed }
  }));
  return { nodes, edges };
}

function toDefinition(rfNodes, rfEdges, prev) {
  const byId = Object.fromEntries((prev.nodes || []).map((n) => [n.id, n]));
  const nodes = rfNodes.map((rn) => {
    const old = byId[rn.id] || {};
    return {
      id: rn.id,
      type: rn.data.nodeType,
      config: old.config ?? NODE_DEFINITIONS[rn.data.nodeType]?.defaultConfig ?? {},
      inputMapping: old.inputMapping || {},
      outputMapping: old.outputMapping || {},
      position: rn.position,
      errorHandling: old.errorHandling || { onError: 'stop', retryCount: 0, retryDelayMs: 0 }
    };
  });
  const connections = rfEdges.map((e) => ({
    from: e.source,
    to: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {})
  }));
  return { nodes, connections };
}

export default function Builder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef(null);
  const [workflow, setWorkflow] = useState(null);
  const [definition, setDefinition] = useState({ nodes: [], connections: [] });
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('configure');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runInput, setRunInput] = useState('{\n  "name": "Ada"\n}');
  const [lastRun, setLastRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [webhook, setWebhook] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ everyMinutes: 60, enabled: true });
  const [openOutput, setOpenOutput] = useState(null);

  useEffect(() => {
    api.getWorkflow(id).then((d) => {
      if (!d?.workflow) throw new Error('Workflow not found or API returned no data.');
      setWorkflow(d.workflow);
      const def = d.workflow.definition || { nodes: [], connections: [] };
      setDefinition(def);
      const { nodes, edges } = toReactFlow(def);
      setRfNodes(nodes);
      setRfEdges(edges);
    }).catch((e) => setError(e.message));
    api.listExecutions({ workflowId: id }).then((d) => setHistory(d.executions || [])).catch(() => {});
    api.webhookInfo(id).then((d) => setWebhook(d.webhook)).catch(() => {});
    api.getSchedule(id).then((d) => {
      setSchedule(d.schedule);
      if (d.schedule) setScheduleForm({ everyMinutes: d.schedule.every_minutes, enabled: d.schedule.enabled });
    }).catch(() => {});
  }, [id]);

  const syncDefinition = useCallback((nodes, edges) => {
    setDefinition((prev) => toDefinition(nodes, edges, prev));
    setDirty(true);
  }, []);

  const onNodesChange = useCallback((changes) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  }, []);

  const onConnect = useCallback((params) => {
    setRfEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, label: params.sourceHandle || '' }, eds));
    setDirty(true);
  }, []);

  useEffect(() => {
    // keep definition + handle labels in sync after edge changes
    setDefinition((prev) => toDefinition(rfNodes, rfEdges, prev));
    setRfEdges((eds) => eds.map((e) => ({ ...e, label: e.sourceHandle || '' })));
  }, [rfNodes, rfEdges]);

  const addNode = (type, position) => {
    const nid = newNodeId(type);
    const rfNode = {
      id: nid,
      type: 'forge',
      position: position || { x: 120 + Math.random() * 200, y: 120 + Math.random() * 200 },
      data: { nodeId: nid, nodeType: type, status: null, graphNode: { id: nid, type, config: NODE_DEFINITIONS[type]?.defaultConfig || {} } }
    };
    setRfNodes((nds) => [...nds, rfNode]);
    setSelectedNodeId(nid);
    setTab('configure');
    setDirty(true);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/flowforge-node');
    if (!type) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    addNode(type, { x: e.clientX - bounds.left - 85, y: e.clientY - bounds.top - 20 });
  };

  const selectedGraphNode = useMemo(
    () => definition.nodes.find((n) => n.id === selectedNodeId) || null,
    [definition, selectedNodeId]
  );
  const selectedEdge = useMemo(() => rfEdges.find((e) => e.id === selectedEdgeId) || null, [rfEdges, selectedEdgeId]);

  const patchNode = (nodeId, patch) => {
    setDefinition((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n))
    }));
    setDirty(true);
    // refresh custom node data (dynamic switch handles)
    setRfNodes((nds) => nds.map((rn) => {
      if (rn.id !== nodeId) return rn;
      const updated = definition.nodes.find((n) => n.id === nodeId);
      const merged = { ...(updated || {}), ...patch };
      return { ...rn, data: { ...rn.data, graphNode: merged } };
    }));
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setRfNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setRfEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setDirty(true);
  };

  const save = async () => {
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const def = toDefinition(rfNodes, rfEdges, definition);
      const r = await api.updateWorkflow(id, { definition: def });
      if (!r?.workflow) throw new Error('Save returned no data.');
      setWorkflow(r.workflow);
      setDefinition(r.workflow.definition);
      setDirty(false);
      setNotice('Saved.');
    } catch (e) {
      setError(e.details ? `${e.message} — ${JSON.stringify(e.details)}` : e.message);
    } finally {
      setBusy('');
    }
  };

  const run = async () => {
    setBusy('run');
    setError('');
    setNotice('');
    try {
      let input = {};
      try {
        input = runInput.trim() ? JSON.parse(runInput) : {};
      } catch {
        throw new Error('Run input is not valid JSON.');
      }
      if (dirty) await save();
      const r = await api.executeWorkflow(id, input);
      if (!r || typeof r !== 'object') throw new Error('Run returned no data.');
      setLastRun(r);
      const statuses = {};
      for (const [nid, res] of Object.entries(r.nodeResults || {})) statuses[nid] = res;
      const { nodes, edges } = toReactFlow(toDefinition(rfNodes, rfEdges, definition), statuses);
      setRfNodes(nodes);
      setRfEdges(edges);
      api.listExecutions({ workflowId: id }).then((d) => setHistory(d.executions || [])).catch(() => {});
      const runErrors = Array.isArray(r.errors) ? r.errors : [];
      if (r.status === 'failed') setError(`Run failed: ${runErrors.map((e) => (e.nodeId ? `${e.nodeId}: ` : '') + e.message).join(' | ') || 'unknown error'}`);
      else setNotice(`Run ${r.status || 'finished'}${typeof r.durationMs === 'number' ? ` in ${(r.durationMs / 1000).toFixed(2)}s` : ''}.`);
    } catch (e) {
      setError(e.details ? `${e.message} — ${JSON.stringify(e.details)}` : e.message);
    } finally {
      setBusy('');
    }
  };

  const duplicate = async () => {
    try {
      const r = await api.duplicateWorkflow(id);
      if (!r?.workflow?.id) throw new Error('Duplicate returned no data.');
      navigate(`/workflows/${r.workflow.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this workflow and all its executions?')) return;
    try {
      await api.deleteWorkflow(id);
      navigate('/workflows');
    } catch (e) {
      setError(e.message);
    }
  };

  const downloadCsv = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error && !workflow) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!workflow) {
    return (
      <div className="space-y-3" aria-label="Loading workflow">
        <div className="skeleton h-14 rounded-xl" />
        <div className="grid grid-cols-12 gap-3" style={{ height: '60vh' }}>
          <div className="skeleton col-span-2 rounded-xl" />
          <div className="skeleton col-span-7 rounded-xl" />
          <div className="skeleton col-span-3 rounded-xl" />
        </div>
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: PALETTE.filter((p) => p.category === cat) }));

  return (
    <div className="page-enter space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-800 bg-ink-950 px-4 py-2 text-white shadow-card">
        <Link to="/workflows" className="btn-press inline-flex items-center gap-1 text-sm text-ink-300 hover:text-forge-300">
          <BackIcon className="h-4 w-4" /> All
        </Link>
        <input value={workflow.name} onChange={(e) => { setWorkflow({ ...workflow, name: e.target.value }); setDirty(true); }}
          onBlur={async () => { try { const r = await api.updateWorkflow(id, { name: workflow.name }); setWorkflow(r.workflow); } catch {} }}
          aria-label="Workflow name"
          className="min-w-0 flex-1 rounded-md border-b border-transparent bg-transparent px-1 text-lg font-bold tracking-tight outline-none hover:border-ink-600 focus:border-forge-500 sm:flex-none sm:basis-64" />
        {dirty && (
          <span className="rounded-full bg-forge-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-forge-300">
            unsaved
          </span>
        )}
        <label className="flex items-center gap-1.5 text-xs text-ink-300">
          <input type="checkbox" checked={workflow.enabled} className="h-3.5 w-3.5 accent-amber-500"
            onChange={async (e) => {
              const r = await api.updateWorkflow(id, { enabled: e.target.checked });
              setWorkflow(r.workflow);
            }} /> Enabled
        </label>
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          <button onClick={save} disabled={busy !== ''}
            className="btn-press rounded-lg border border-ink-700 px-3 py-1.5 font-medium text-ink-100 hover:bg-ink-800 disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setTab('run'); run(); }} disabled={busy !== ''}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-forge-500 px-3 py-1.5 font-semibold text-ink-950 hover:bg-forge-400 disabled:opacity-50">
            <PlayIcon className="h-3.5 w-3.5" />
            {busy === 'run' ? 'Running…' : 'Run'}
          </button>
          <button onClick={duplicate}
            className="btn-press rounded-lg border border-ink-700 px-3 py-1.5 text-ink-100 hover:bg-ink-800">Duplicate</button>
          <button onClick={remove}
            className="btn-press rounded-lg border border-red-400/40 px-3 py-1.5 text-red-300 hover:bg-red-500/10">Delete</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12" style={{ height: 'auto' }}>
        {/* palette */}
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-card lg:col-span-2 lg:max-h-[72vh] lg:overflow-y-auto">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Nodes · drag or click</div>
          <div className="grid grid-cols-2 gap-x-3 lg:block">
            {grouped.map((g) => (
              <div key={g.cat} className="mb-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-forge-700">{g.cat}</div>
                {g.items.map((p) => (
                  <div key={p.type}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/flowforge-node', p.type)}
                    onClick={() => addNode(p.type)}
                    title={p.description}
                    className="row-hover mb-1 flex cursor-pointer items-center gap-2 rounded-lg border border-ink-100 bg-paper px-2 py-1.5 text-xs font-medium text-ink-800 hover:border-forge-400 hover:shadow-card">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    <span className="truncate">{p.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* canvas */}
        <div className="h-[60vh] overflow-hidden rounded-xl border border-ink-200 shadow-card lg:col-span-7 lg:h-[72vh]" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); setTab('configure'); }}
            onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* right panel */}
        <div className="flex max-h-none flex-col overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card lg:col-span-3 lg:max-h-[72vh]">
          <div className="flex border-b border-ink-100 bg-paper text-xs font-semibold" role="tablist">
            {['configure', 'run', 'history', 'triggers'].map((t) => (
              <button key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}
                className={`btn-press flex-1 px-2 py-2.5 capitalize transition-colors ${tab === t ? 'bg-white text-forge-700 shadow-[inset_0_-2px_0_0_#f59e0b]' : 'text-ink-400 hover:text-ink-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'configure' && (
              <>
                {selectedEdge && (
                  <div className="border-b border-ink-100 bg-forge-50/60 p-4">
                    <div className="mb-1 text-xs font-semibold text-ink-800">
                      Edge: <span className="font-mono">{selectedEdge.source}</span>
                      <ArrowIcon className="mx-1 inline h-3.5 w-3.5 text-forge-600" />
                      <span className="font-mono">{selectedEdge.target}</span>
                    </div>
                    {(() => {
                      const src = definition.nodes.find((n) => n.id === selectedEdge.source);
                      const opts = src?.type === 'condition' ? ['true', 'false']
                        : src?.type === 'switch' ? [...(src.config?.cases || []).map((c) => c.id || String(c.value)), 'default']
                        : [];
                      if (opts.length === 0) return <div className="text-xs text-ink-400">Plain edge — runs after the source succeeds.</div>;
                      return (
                        <select value={selectedEdge.sourceHandle || ''}
                          className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30"
                          onChange={(e) => {
                            const v = e.target.value;
                            setRfEdges((eds) => eds.map((x) => (x.id === selectedEdge.id ? { ...x, sourceHandle: v || undefined, label: v } : x)));
                            setDirty(true);
                          }}>
                          <option value="">— select branch —</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      );
                    })()}
                    <button onClick={() => { setRfEdges((eds) => eds.filter((x) => x.id !== selectedEdge.id)); setSelectedEdgeId(null); setDirty(true); }}
                      className="btn-press mt-2 text-xs font-medium text-red-600 hover:text-red-700">Delete edge</button>
                  </div>
                )}
                <ConfigPanel
                  node={selectedGraphNode}
                  onConfigChange={(cfg) => patchNode(selectedNodeId, { config: cfg })}
                  onErrorHandlingChange={(eh) => patchNode(selectedNodeId, { errorHandling: eh })}
                />
                {selectedGraphNode && (
                  <div className="p-4 pt-0">
                    <button onClick={deleteSelectedNode}
                      className="btn-press rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Delete node
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === 'run' && (
              <div className="space-y-3 p-4">
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Trigger input <span className="font-mono normal-case text-ink-400">(JSON into {'{{trigger.*}}'})</span>
                  </div>
                  <textarea value={runInput} onChange={(e) => setRunInput(e.target.value)} rows={6}
                    spellCheck={false} className="w-full rounded-lg border border-ink-200 bg-ink-950 px-2.5 py-2 font-mono text-xs text-ink-100 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30" />
                </div>
                <button onClick={run} disabled={busy !== ''}
                  className="btn-press inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-forge-500 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-forge-400 disabled:opacity-50">
                  <PlayIcon className="h-4 w-4" />
                  {busy === 'run' ? 'Running…' : 'Run workflow'}
                </button>
                {lastRun && (
                  <div className="space-y-2 text-xs">
                      <div className={`rounded-lg p-2 font-semibold ${lastRun.status === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                        {lastRun.status || 'done'}{typeof lastRun.durationMs === 'number' ? ` · ${(lastRun.durationMs / 1000).toFixed(2)}s` : ''}
                      </div>
                    {lastRun.errors?.map((e, i) => (
                      <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">
                        {e.nodeId && <span className="font-mono font-semibold">{e.nodeId}: </span>}{e.message}
                      </div>
                    ))}
                    {Object.entries(lastRun.nodeResults || {}).map(([nid, r]) => (
                      <div key={nid} className="rounded-lg border border-ink-100">
                        <button onClick={() => setOpenOutput(openOutput === nid ? null : nid)}
                          aria-expanded={openOutput === nid}
                          className="row-hover flex w-full items-center gap-2 px-2 py-1.5 hover:bg-paper">
                          <span className={`h-2 w-2 rounded-full ${r.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                          <span className="font-mono">{nid}</span>
                          <span className="tnum ml-auto text-ink-400">{r.durationMs}ms</span>
                        </button>
                        {openOutput === nid && (
                          <div className="px-2 pb-2">
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-ink-800 bg-ink-950 p-2 text-ink-100">
                              {r.error ? r.error : JSON.stringify(r.output, null, 2)}
                            </pre>
                            {r.output?.csv && (
                              <button onClick={() => {
                                const blob = new Blob([r.output.csv], { type: 'text/csv' });
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = r.output.filename || 'export.csv';
                                a.click();
                              }} className="btn-press mt-1 rounded border border-ink-200 px-2 py-1 text-xs">Download CSV</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div>
                      <div className="mb-1 font-semibold text-ink-800">Final output</div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-100 bg-paper p-2">{JSON.stringify(lastRun.output, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === 'history' && (
              <div className="space-y-2 p-4 text-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Execution history</div>
                {history.map((h) => (
                  <div key={h.id} className="row-hover flex items-center gap-2 rounded-lg border border-ink-100 p-2 hover:bg-paper">
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${h.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                      {h.status}
                    </span>
                    <span className="tnum font-mono text-[11px] text-ink-400">{String(h.id || '').slice(0, 8)}</span>
                    <Link to={`/executions/${h.id}`}
                      className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-forge-700 hover:text-forge-600">
                      Inspect <ArrowIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
                {history.length === 0 && <div className="text-xs text-ink-400">No runs yet.</div>}
              </div>
            )}
            {tab === 'triggers' && (
              <div className="space-y-4 p-4 text-sm">
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">Webhook</div>
                  <div className="break-all rounded-lg border border-ink-200 bg-ink-950 p-2 font-mono text-xs text-forge-300">POST /api/webhooks/{id}</div>
                  {webhook && <div className="mt-1 text-xs text-ink-500">Status: {webhook.enabled ? 'enabled' : 'disabled'} · secret configured</div>}
                  <button onClick={async () => {
                    await api.rotateWebhookSecret(id);
                    setNotice('Webhook secret rotated. Pass it as X-Webhook-Secret.');
                  }} className="btn-press mt-2 rounded-md border border-ink-200 px-2 py-1.5 text-xs font-medium hover:border-forge-400 hover:bg-forge-50">Rotate secret</button>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">Schedule (free-tier polling)</div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={5} max={1440} value={scheduleForm.everyMinutes}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, everyMinutes: Number(e.target.value) })}
                      className="w-24 rounded-md border border-ink-200 px-2 py-1.5 outline-none focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30" />
                    <span className="text-xs text-ink-500">minutes</span>
                    <label className="flex items-center gap-1 text-xs text-ink-600">
                      <input type="checkbox" checked={scheduleForm.enabled} className="h-3.5 w-3.5 accent-amber-600"
                        onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })} /> on
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={async () => {
                      const r = await api.saveSchedule(id, scheduleForm);
                      setSchedule(r.schedule);
                      setNotice(`Scheduled every ${r.schedule.every_minutes} min.`);
                    }} className="btn-press rounded-md border border-ink-200 px-2 py-1.5 text-xs font-medium hover:border-forge-400 hover:bg-forge-50">Save schedule</button>
                    {schedule && (
                      <button onClick={async () => { await api.deleteSchedule(id); setSchedule(null); setNotice('Schedule removed.'); }}
                        className="btn-press rounded-md border border-ink-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50">Remove</button>
                    )}
                  </div>
                  {schedule?.next_run_at && <div className="tnum mt-1 text-xs text-ink-500">Next run ≈ {new Date(schedule.next_run_at).toLocaleString()}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
