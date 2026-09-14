/**
 * Node executors — every major node type genuinely executes.
 *
 * Each executor receives (node, ctx) where ctx = {
 *   context,      // variable-resolution context { trigger, workflow, nodes }
 *   inputs,       // merged inputMapping values
 *   config,       // resolved node config (templates already resolved)
 *   rawConfig,    // unresolved config (for AI nodes that need raw templates)
 *   signal,       // AbortSignal for timeouts
 *   supabase,     // admin client or null
 *   userId, workflowId, executionId
 * }
 * and returns { output, branch?, response? }.
 *
 * SAFETY: predefined operations only. No eval / new Function anywhere.
 */
import { resolveDeep, resolveString } from './variables.js';
import { chatCompletion, classify, extract, summarize, generate } from './nvidiaAI.js';

const HTTP_TIMEOUT_MS = 15000;
const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254'
]);

function isBlockedUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return 'URL is not a valid absolute URL.';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Only http and https URLs are allowed.';
  }
  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.internal')
  ) {
    return 'Requests to private / internal hosts are blocked.';
  }
  return null;
}

/** Shared comparison operators for condition / filter nodes. */
export function compareValues(left, operator, right) {
  switch (operator) {
    case 'equals':
      // eslint-disable-next-line eqeqeq
      return left == right;
    case 'not_equals':
      // eslint-disable-next-line eqeqeq
      return left != right;
    case 'strict_equals':
      return left === right;
    case 'contains':
      if (Array.isArray(left)) return left.includes(right);
      return String(left ?? '').includes(String(right ?? ''));
    case 'not_contains':
      if (Array.isArray(left)) return !left.includes(right);
      return !String(left ?? '').includes(String(right ?? ''));
    case 'starts_with':
      return String(left ?? '').startsWith(String(right ?? ''));
    case 'ends_with':
      return String(left ?? '').endsWith(String(right ?? ''));
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'is_empty': {
      if (left === undefined || left === null || left === '') return true;
      if (Array.isArray(left)) return left.length === 0;
      if (typeof left === 'object') return Object.keys(left).length === 0;
      return false;
    }
    case 'is_not_empty':
      return !compareValues(left, 'is_empty', null);
    case 'exists':
      return left !== undefined && left !== null;
    default:
      throw new Error(`Unknown operator "${operator}".`);
  }
}

function evaluateConditions(conditions, logic, context) {
  const results = conditions.map((c) => {
    const left = resolveString(c.left ?? c.field ?? '', context);
    // `right` may be a template string, number, boolean…
    const right = typeof c.right === 'string' ? resolveString(c.right, context) : c.right;
    const rawLeft = typeof left === 'string' && c.leftType === 'number' ? Number(left) : left;
    return compareValues(rawLeft, c.operator || 'equals', right);
  });
  return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

/* ------------------------------- triggers ------------------------------- */

async function execTrigger(node, ctx) {
  if (node.type === 'webhook_trigger') {
    return {
      output: {
        body: ctx.context.trigger?.body ?? ctx.context.trigger ?? {},
        query: ctx.context.trigger?.query ?? {},
        headers: ctx.context.trigger?.headers ?? {}
      }
    };
  }
  if (node.type === 'schedule_trigger') {
    return {
      output: {
        scheduledAt: new Date().toISOString(),
        input: ctx.context.workflow?.input ?? {}
      }
    };
  }
  // manual_trigger
  return { output: { ...(ctx.context.workflow?.input ?? {}), ...(ctx.context.trigger ?? {}) } };
}

/* --------------------------------- data --------------------------------- */

async function execSetValue(node, ctx) {
  const values = ctx.rawConfig.values || ctx.config.values || {};
  return { output: resolveDeep(values, ctx.context) };
}

async function execJsonParser(node, ctx) {
  const raw = ctx.config.input ?? ctx.inputs.input ?? '';
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try {
    return { output: JSON.parse(text) };
  } catch (err) {
    throw new Error(`JSON Parser: invalid JSON — ${err.message}`);
  }
}

function applyTransformOp(data, op) {
  if (!op || typeof op.op !== 'string') throw new Error('Transform: each operation needs an "op" name.');
  switch (op.op) {
    case 'pick': {
      if (data === null || typeof data !== 'object') throw new Error('Transform pick: input must be an object.');
      const out = {};
      for (const f of op.fields || []) out[f] = data[f];
      return out;
    }
    case 'omit': {
      if (data === null || typeof data !== 'object') throw new Error('Transform omit: input must be an object.');
      const drop = new Set(op.fields || []);
      const out = {};
      for (const [k, v] of Object.entries(data)) if (!drop.has(k)) out[k] = v;
      return out;
    }
    case 'rename': {
      if (data === null || typeof data !== 'object') throw new Error('Transform rename: input must be an object.');
      const map = op.mapping || {};
      const out = {};
      for (const [k, v] of Object.entries(data)) out[map[k] || k] = v;
      return out;
    }
    case 'set': {
      const out = data !== null && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
      out[op.key] = op.value;
      return out;
    }
    case 'merge': {
      const extra = op.value && typeof op.value === 'object' ? op.value : {};
      if (Array.isArray(data)) return [...data, extra];
      return { ...(data || {}), ...extra };
    }
    case 'flatten': {
      if (data === null || typeof data !== 'object') throw new Error('Transform flatten: input must be an object.');
      const delim = op.delimiter || '_';
      const out = {};
      const walk = (obj, prefix) => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}${delim}${k}` : k;
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
          else out[key] = v;
        }
      };
      walk(data, '');
      return out;
    }
    case 'sort_by': {
      if (!Array.isArray(data)) throw new Error('Transform sort_by: input must be an array.');
      const dir = op.direction === 'desc' ? -1 : 1;
      return [...data].sort((a, b) => {
        const av = a?.[op.field];
        const bv = b?.[op.field];
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    case 'unique_by': {
      if (!Array.isArray(data)) throw new Error('Transform unique_by: input must be an array.');
      const seen = new Set();
      return data.filter((row) => {
        const k = JSON.stringify(row?.[op.field]);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    default:
      throw new Error(`Transform: unknown operation "${op.op}". Allowed: pick, omit, rename, set, merge, flatten, sort_by, unique_by.`);
  }
}

async function execTransformData(node, ctx) {
  const rawInput = ctx.rawConfig.input ?? ctx.inputs.input ?? ctx.rawConfig.data;
  let data = resolveDeep(rawInput, ctx.context);
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // keep as string for set/merge ops
    }
  }
  const operations = ctx.config.operations || [];
  let current = data ?? {};
  for (const op of operations) {
    current = applyTransformOp(current, op);
  }
  return { output: current };
}

async function execFilter(node, ctx) {
  const rawInput = ctx.rawConfig.input ?? ctx.inputs.input;
  let data = resolveDeep(rawInput, ctx.context);
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error('Filter: input must be an array (or JSON string of an array).');
    }
  }
  if (!Array.isArray(data)) throw new Error('Filter: input must be an array.');
  const conditions = ctx.config.conditions || [];
  const logic = ctx.config.logic || 'and';
  const itemMatches = (item) => {
    const results = conditions.map((c) => {
      const field = (c.field || '').replace(/^\$\./, '');
      const left = field.split('.').reduce((acc, p) => (acc == null ? acc : acc[p]), item);
      return compareValues(left, c.operator || 'equals', c.value);
    });
    return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  };
  const filtered = data.filter(itemMatches);
  return { output: { items: filtered, count: filtered.length, total: data.length } };
}

async function execFormatter(node, ctx) {
  const template = ctx.rawConfig.template ?? ctx.rawConfig.text ?? '';
  return { output: { text: resolveString(String(template), ctx.context) } };
}

async function execCondition(node, ctx) {
  const conditions = ctx.config.conditions || [];
  const logic = ctx.config.logic || 'and';
  const result = evaluateConditions(conditions, logic, ctx.context);
  return { output: { result, matched: result }, branch: result ? 'true' : 'false' };
}

async function execSwitch(node, ctx) {
  const input = resolveString(String(ctx.rawConfig.input ?? ctx.inputs.input ?? ''), ctx.context);
  const cases = ctx.config.cases || [];
  const found = cases.find((c) => String(c.value ?? '') === String(input ?? ''));
  if (found) {
    return { output: { matched: found.id || found.value, value: input }, branch: found.id || String(found.value) };
  }
  return { output: { matched: 'default', value: input }, branch: 'default' };
}

async function execLoop(node, ctx) {
  const rawItems = ctx.rawConfig.items ?? ctx.inputs.items ?? [];
  let items = resolveDeep(rawItems, ctx.context);
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      throw new Error('Loop: items must be an array.');
    }
  }
  if (!Array.isArray(items)) throw new Error('Loop: items must be an array.');
  const maxIterations = Math.min(Number(ctx.config.maxIterations) || 100, 500);
  const sliced = items.slice(0, maxIterations);
  const itemTemplate = ctx.rawConfig.itemTemplate;
  const operations = ctx.config.operations || [];
  const mapped = sliced.map((item, index) => {
    const itemCtx = {
      ...ctx.context,
      loop: { item, index }
    };
    let current = itemTemplate !== undefined ? resolveDeep(itemTemplate, itemCtx) : item;
    for (const op of operations) current = applyTransformOp(current, op);
    return current;
  });
  return { output: { items: mapped, count: mapped.length, total: items.length, truncated: items.length > maxIterations } };
}

/* --------------------------------- HTTP --------------------------------- */

async function execHttpRequest(node, ctx) {
  const method = String(ctx.config.method || 'GET').toUpperCase();
  const url = String(ctx.config.url || '');
  if (!url) throw new Error('HTTP Request: url is required.');
  const blocked = isBlockedUrl(url);
  if (blocked) throw new Error(`HTTP Request blocked: ${blocked}`);
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
  if (!allowed.includes(method)) throw new Error(`HTTP Request: method ${method} is not allowed.`);

  const headers = ctx.config.headers && typeof ctx.config.headers === 'object' ? { ...ctx.config.headers } : {};
  let body;
  if (ctx.config.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    body = typeof ctx.config.body === 'string' ? ctx.config.body : JSON.stringify(ctx.config.body);
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
  }
  const timeoutMs = Math.min(Number(ctx.config.timeoutMs) || HTTP_TIMEOUT_MS, 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: ctx.signal || controller.signal
    });
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    const resHeaders = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    return { output: { status: res.status, ok: res.ok, headers: resHeaders, data } };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`HTTP Request timed out after ${timeoutMs}ms.`);
    throw new Error(`HTTP Request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function execWebhookResponse(node, ctx) {
  const status = Math.min(Math.max(Number(ctx.config.status) || 200, 100), 599);
  const body = ctx.config.body !== undefined ? ctx.config.body : { ok: true };
  const headers = ctx.config.headers && typeof ctx.config.headers === 'object' ? ctx.config.headers : {};
  return {
    output: { status, body, headers },
    response: { status, body, headers },
    stop: ctx.rawConfig.stop === true
  };
}

/* ---------------------------------- AI ---------------------------------- */

function aiParams(ctx) {
  return {
    temperature: ctx.config.temperature ?? 0.3,
    maxTokens: ctx.config.maxTokens ?? ctx.config.maxOutput ?? 1024
  };
}

async function execAiGeneration(node, ctx) {
  const input = resolveString(String(ctx.rawConfig.prompt ?? ctx.rawConfig.input ?? ''), ctx.context);
  const system = ctx.config.system ?? ctx.config.systemInstruction;
  const text = await generate(
    { input, system, ...aiParams(ctx) },
    { timeoutMs: 60000 }
  );
  return { output: { text } };
}

async function execAiClassification(node, ctx) {
  const input = resolveString(String(ctx.rawConfig.input ?? ctx.rawConfig.prompt ?? ''), ctx.context);
  const categories = ctx.config.categories || [];
  const system = ctx.config.system ?? ctx.config.systemInstruction;
  const result = await classify({ input, categories, system, ...aiParams(ctx) }, { timeoutMs: 60000 });
  return { output: { label: result.label, confidence: result.confidence, reason: result.reason } };
}

async function execAiExtraction(node, ctx) {
  const input = resolveString(String(ctx.rawConfig.input ?? ctx.rawConfig.prompt ?? ''), ctx.context);
  const schema = ctx.config.schema || { type: 'object' };
  const system = ctx.config.system ?? ctx.config.systemInstruction;
  const result = await extract({ input, schema, system, ...aiParams(ctx) }, { timeoutMs: 60000 });
  return { output: { data: result.data, parseOk: result.parseOk } };
}

async function execAiSummarization(node, ctx) {
  const input = resolveString(String(ctx.rawConfig.input ?? ctx.rawConfig.prompt ?? ''), ctx.context);
  const system = ctx.config.system ?? ctx.config.systemInstruction;
  const text = await summarize(
    { input, system, style: ctx.config.style, ...aiParams(ctx) },
    { timeoutMs: 60000 }
  );
  return { output: { summary: text, text } };
}

async function execAiDataTransformation(node, ctx) {
  const rawInput = ctx.rawConfig.input ?? ctx.inputs.input ?? '';
  const input = typeof rawInput === 'string' ? resolveString(rawInput, ctx.context) : JSON.stringify(resolveDeep(rawInput, ctx.context));
  const instruction = resolveString(String(ctx.rawConfig.instruction ?? ctx.rawConfig.prompt ?? 'Transform the input data.'), ctx.context);
  const system =
    ctx.config.system ??
    ctx.config.systemInstruction ??
    'You transform data. Respond with a JSON value only — no code, no explanation, no markdown fences.';
  const text = await chatCompletion(
    {
      system,
      prompt: `Instruction: ${instruction}\n\nInput data:\n${input}\n\nRespond with the transformed JSON value only.`,
      temperature: ctx.config.temperature ?? 0.1,
      maxTokens: ctx.config.maxTokens ?? ctx.config.maxOutput ?? 2048,
      jsonMode: true
    },
    { timeoutMs: 60000 }
  );
  // Reuse safe parsing via dynamic import to avoid cycles (same module dir).
  const { safeParseJson } = await import('./nvidiaAI.js');
  const parsed = safeParseJson(text);
  return { output: { data: parsed.ok ? parsed.data : null, parseOk: parsed.ok, raw: text.slice(0, 8000) } };
}

/* --------------------------------- output -------------------------------- */

async function execSaveToDatabase(node, ctx) {
  const table = ctx.config.table || 'workflow_records';
  const allowedTables = ['workflow_records'];
  if (!allowedTables.includes(table)) {
    throw new Error(`Save to Database: table "${table}" is not allowed. Allowed: ${allowedTables.join(', ')}.`);
  }
  const data = ctx.config.data !== undefined ? ctx.config.data : ctx.inputs;
  if (!ctx.supabase) {
    return { output: { saved: false, table, data, note: 'No database client available (local test mode).' } };
  }
  const { data: inserted, error } = await ctx.supabase
    .from(table)
    .insert({
      workflow_id: ctx.workflowId,
      user_id: ctx.userId,
      node_id: ctx.node.id,
      execution_id: ctx.executionId || null,
      data
    })
    .select('id')
    .single();
  if (error) throw new Error(`Save to Database failed: ${error.message}`);
  return { output: { saved: true, table, id: inserted?.id ?? null, data } };
}

function toCsv(rows, columns) {
  let cols;
  if (typeof columns === 'string') {
    cols = columns.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(columns)) {
    cols = columns;
  } else {
    cols = [];
  }
  if (cols.length === 0) cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(esc).join(',')];
  for (const row of rows) lines.push(cols.map((c) => esc(row?.[c])).join(','));
  return { csv: lines.join('\n'), columns: cols };
}

async function execCsvExport(node, ctx) {
  const rawInput = ctx.rawConfig.input ?? ctx.rawConfig.data ?? ctx.inputs.items ?? ctx.inputs.input ?? [];
  let data = resolveDeep(rawInput, ctx.context);
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error('CSV Export: input must be an array of objects.');
    }
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
    data = data.items;
  }
  if (!Array.isArray(data)) throw new Error('CSV Export: input must be an array of objects.');
  const { csv, columns } = toCsv(data, ctx.config.columns);
  return {
    output: {
      csv,
      columns,
      rowCount: data.length,
      filename: ctx.config.filename || 'export.csv'
    }
  };
}

/* -------------------------------- registry ------------------------------- */

const EXECUTORS = {
  manual_trigger: execTrigger,
  webhook_trigger: execTrigger,
  schedule_trigger: execTrigger,
  set_value: execSetValue,
  json_parser: execJsonParser,
  transform_data: execTransformData,
  filter: execFilter,
  formatter: execFormatter,
  condition: execCondition,
  switch: execSwitch,
  loop: execLoop,
  http_request: execHttpRequest,
  webhook_response: execWebhookResponse,
  ai_generation: execAiGeneration,
  ai_classification: execAiClassification,
  ai_extraction: execAiExtraction,
  ai_summarization: execAiSummarization,
  ai_data_transformation: execAiDataTransformation,
  save_to_database: execSaveToDatabase,
  csv_export: execCsvExport
};

export function getExecutor(type) {
  return EXECUTORS[type] || null;
}

/**
 * Execute a single node: resolve inputMapping + config templates against the
 * context, then run the executor. Returns { output, branch?, response?, stop? }.
 */
export async function executeNode(node, baseCtx) {
  const executor = getExecutor(node.type);
  if (!executor) throw new Error(`Unknown node type "${node.type}".`);
  const rawConfig = node.config && typeof node.config === 'object' ? node.config : {};
  const resolvedConfig = resolveDeep(rawConfig, baseCtx.context);
  const resolvedInputs = {};
  const inputMapping = node.inputMapping && typeof node.inputMapping === 'object' ? node.inputMapping : {};
  for (const [key, template] of Object.entries(inputMapping)) {
    resolvedInputs[key] = typeof template === 'string' ? resolveString(template, baseCtx.context) : resolveDeep(template, baseCtx.context);
  }
  return executor(node, {
    ...baseCtx,
    node,
    config: resolvedConfig,
    rawConfig,
    inputs: { ...resolvedInputs, ...(baseCtx.extraInputs || {}) }
  });
}
