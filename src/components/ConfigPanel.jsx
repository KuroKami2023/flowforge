import { useState } from 'react';
import { NODE_DEFINITIONS, OPERATORS } from '../lib/nodeDefinitions.js';

function XIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
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

function Row({ label, children, hint }) {
  return (
    <label className="mb-3 block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-forge-500 focus:ring-2 focus:ring-forge-500/30 outline-none transition-shadow';

function KeyValueEditor({ value, onChange }) {
  const rows = Object.entries(value || {});
  const setRow = (i, k, v) => {
    const next = rows.map(([ok, ov], j) => (j === i ? [k, ov] : [ok, ov]));
    if (k !== rows[i][0]) {
      const obj = {};
      next.forEach(([kk, vv]) => { if (kk) obj[kk] = vv; });
      // preserve edited value under the new key
      obj[k] = v;
      onChange(obj);
    } else {
      const obj = {};
      next.forEach(([kk, vv]) => { if (kk) obj[kk] = vv; });
      obj[k] = v;
      onChange(obj);
    }
  };
  const add = () => onChange({ ...(value || {}), [`key${rows.length + 1}`]: '' });
  const remove = (key) => {
    const obj = { ...(value || {}) };
    delete obj[key];
    onChange(obj);
  };
  return (
    <div className="space-y-1.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-1.5">
          <input value={k} onChange={(e) => setRow(i, e.target.value, v)} className={inputCls} placeholder="key" />
          <input value={typeof v === 'string' ? v : JSON.stringify(v)} onChange={(e) => setRow(i, k, e.target.value)} className={inputCls} placeholder="{{trigger.x}}" />
          <button type="button" onClick={() => remove(k)} aria-label="Remove pair"
            className="btn-press shrink-0 rounded-md px-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="btn-press inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-forge-700 hover:bg-forge-50">
        <PlusIcon className="h-3.5 w-3.5" /> Add pair
      </button>
    </div>
  );
}

function ConditionsEditor({ value, onChange, leftKey = 'field', rightKey = 'value' }) {
  const list = Array.isArray(value) ? value : [];
  const update = (i, patch) => {
    const next = list.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-ink-200 bg-paper p-2">
          <input value={c[leftKey] || ''} onChange={(e) => update(i, { [leftKey]: e.target.value })}
            className={inputCls} placeholder={leftKey === 'left' ? '{{trigger.status}}' : 'field name ($. for root in filter)'} />
          <div className="flex gap-1.5">
            <select value={c.operator || 'equals'} onChange={(e) => update(i, { operator: e.target.value })} className={inputCls}>
              {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input value={c[rightKey] === undefined || c[rightKey] === null ? '' : String(c[rightKey])}
              onChange={(e) => update(i, { [rightKey]: e.target.value })}
              className={inputCls} placeholder="value" />
          </div>
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))}
            className="btn-press text-xs font-medium text-red-600 hover:text-red-700">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { [leftKey]: '', operator: 'equals', [rightKey]: '' }])}
        className="btn-press inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-forge-700 hover:bg-forge-50">
        <PlusIcon className="h-3.5 w-3.5" /> Add condition
      </button>
    </div>
  );
}

function CasesEditor({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  return (
    <div className="space-y-1.5">
      {list.map((c, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={c.id || ''} placeholder="branch id"
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} className={inputCls} />
          <input value={c.value || ''} placeholder="matching value"
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls} />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove case"
            className="btn-press shrink-0 rounded-md px-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { id: '', value: '' }])}
        className="btn-press inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-forge-700 hover:bg-forge-50">
        <PlusIcon className="h-3.5 w-3.5" /> Add case
      </button>
    </div>
  );
}

function JsonField({ value, onChange, rows = 5 }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState('');
  // resync when a different node is selected (parent passes key)
  return (
    <div>
      <textarea value={text} rows={rows} spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr('');
          } catch (ex) {
            setErr(ex.message);
          }
        }}
        className={`${inputCls} font-mono text-xs`} />
      {err && <div className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">Invalid JSON: {err}</div>}
    </div>
  );
}

export default function ConfigPanel({ node, onConfigChange, onErrorHandlingChange }) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          className="h-8 w-8 text-ink-200" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <div className="text-sm font-medium text-ink-500">No node selected</div>
        <div className="text-xs text-ink-400">Select a node on the canvas to configure it.</div>
      </div>
    );
  }
  const def = NODE_DEFINITIONS[node.type];
  if (!def) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unknown node type.</div>;
  const config = node.config || {};
  const set = (key, val) => onConfigChange({ ...config, [key]: val });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-6 w-1 rounded-full" style={{ background: def.color }} aria-hidden="true" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{def.category}</div>
          <h3 className="text-sm font-bold leading-tight text-ink-900">{def.label}</h3>
        </div>
      </div>
      <div className="mb-1 font-mono text-[11px] text-ink-400">{node.id}</div>
      <p className="mb-4 text-xs leading-relaxed text-ink-500">{def.description}</p>

      {def.fields.map((f) => {
        if (f.kind === 'info') return <div key={f.key} className="mb-4 rounded-lg border border-forge-200 bg-forge-50 p-2.5 text-xs leading-relaxed text-forge-900">{f.text}</div>;
        const val = config[f.key];
        switch (f.kind) {
          case 'text':
            return <Row key={f.key} label={f.label}><input value={val ?? ''} placeholder={f.placeholder || ''} onChange={(e) => set(f.key, e.target.value)} className={inputCls} /></Row>;
          case 'textarea':
            return <Row key={f.key} label={f.label}><textarea value={val ?? ''} rows={3} placeholder={f.placeholder || ''} onChange={(e) => set(f.key, e.target.value)} className={inputCls} /></Row>;
          case 'number':
            return <Row key={f.key} label={f.label}><input type="number" value={val ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} /></Row>;
          case 'checkbox':
            return <Row key={f.key} label={f.label}><input type="checkbox" checked={val === true} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4 accent-amber-600" /></Row>;
          case 'select':
            return <Row key={f.key} label={f.label}>
              <select value={val ?? f.options[0]} onChange={(e) => set(f.key, e.target.value)} className={inputCls}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Row>;
          case 'keyvalue':
            return <Row key={f.key} label={f.label}><KeyValueEditor value={val || {}} onChange={(v) => set(f.key, v)} /></Row>;
          case 'json':
            return <Row key={f.key} label={f.label}><JsonField key={`${node.id}:${f.key}`} value={val} onChange={(v) => set(f.key, v)} /></Row>;
          case 'lines':
            return <Row key={f.key} label={f.label} hint="One entry per line.">
              <textarea value={Array.isArray(val) ? val.join('\n') : (val || '')} rows={4}
                onChange={(e) => set(f.key, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} className={inputCls} />
            </Row>;
          case 'conditions':
            return <Row key={f.key} label={f.label}><ConditionsEditor value={val || []} onChange={(v) => set(f.key, v)} leftKey={f.leftKey || 'field'} rightKey={f.rightKey || 'value'} /></Row>;
          case 'cases':
            return <Row key={f.key} label={f.label}><CasesEditor value={val || []} onChange={(v) => set(f.key, v)} /></Row>;
          default:
            return null;
        }
      })}

      <div className="mt-2 border-t border-ink-100 pt-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">Error handling</div>
        <Row label="On error">
          <select value={node.errorHandling?.onError || 'stop'}
            onChange={(e) => onErrorHandlingChange({ ...(node.errorHandling || {}), onError: e.target.value })} className={inputCls}>
            <option value="stop">Stop workflow</option>
            <option value="continue">Continue workflow</option>
          </select>
        </Row>
        <div className="flex gap-2">
          <Row label="Retries (0–5)">
            <input type="number" min={0} max={5} value={node.errorHandling?.retryCount ?? 0}
              onChange={(e) => onErrorHandlingChange({ ...(node.errorHandling || {}), retryCount: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })} className={inputCls} />
          </Row>
          <Row label="Retry delay ms">
            <input type="number" min={0} max={10000} value={node.errorHandling?.retryDelayMs ?? 0}
              onChange={(e) => onErrorHandlingChange({ ...(node.errorHandling || {}), retryDelayMs: Math.min(10000, Math.max(0, Number(e.target.value) || 0)) })} className={inputCls} />
          </Row>
        </div>
      </div>

      <div className="mt-2 rounded-lg bg-ink-950 p-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-forge-400">Variable tips</div>
        <div className="space-y-0.5 font-mono text-[11px] text-ink-200">
          <div>{'{{trigger.body}}'}</div>
          <div>{'{{workflow.input.customer_id}}'}</div>
          <div>{'{{nodes.<node_id>.output}}'}</div>
        </div>
      </div>
    </div>
  );
}
