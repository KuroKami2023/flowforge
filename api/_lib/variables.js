/**
 * Safe variable resolution for FlowForge AI workflows.
 *
 * Supports expressions such as:
 *   {{trigger.email}}  {{trigger.body}}  {{trigger.name}}
 *   {{nodes.http_request.output}}  {{nodes.ai_classifier.output}}
 *   {{workflow.input.customer_id}}
 *
 * SAFETY: pure path lookup only. No eval, no Function constructor, no
 * arbitrary JavaScript. Anything that is not a plain data path resolves
 * to undefined and is rendered as an empty string in templates.
 */

const EXPRESSION_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const FULL_EXPRESSION_RE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
// Allowed path: identifiers separated by dots, with optional [0] indexes.
const SAFE_PATH_RE = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*|\[\d+\])*$/;
// Never allow prototype-chain segments, even though getPath also guards
// with hasOwnProperty — defence in depth against prototype pollution.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafePath(path) {
  if (typeof path !== 'string' || !SAFE_PATH_RE.test(path.trim())) return false;
  const segments = path.trim().replace(/\[(\d+)\]/g, '.$1').split('.');
  return !segments.some((s) => FORBIDDEN_SEGMENTS.has(s));
}

/** Resolve a dotted path (with [n] indexes) against a context object. */
export function getPath(context, path) {
  if (!isSafePath(path)) return undefined;
  const normalized = path.trim().replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.');
  let current = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  // Never leak functions through the variable system.
  if (typeof current === 'function') return undefined;
  return current;
}

/** Build the execution context for a run. */
export function buildContext({ triggerData = {}, workflowInput = {}, nodeOutputs = {} } = {}) {
  return {
    trigger: triggerData,
    workflow: { input: workflowInput || {} },
    nodes: nodeOutputs || {}
  };
}

/**
 * Resolve a single template string.
 * - If the whole string is exactly one expression, return the raw value
 *   (preserves objects / arrays / numbers / booleans).
 * - Otherwise interpolate each expression into the string. Objects become
 *   JSON, undefined/null become ''.
 */
export function resolveString(template, context) {
  if (typeof template !== 'string') return template;
  const full = template.match(FULL_EXPRESSION_RE);
  if (full) {
    const value = getPath(context, full[1]);
    return value === undefined ? '' : value;
  }
  return template.replace(EXPRESSION_RE, (match, path) => {
    const value = getPath(context, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  });
}

/** Recursively resolve all template strings inside objects / arrays. */
export function resolveDeep(value, context) {
  if (typeof value === 'string') return resolveString(value, context);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, context));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveDeep(v, context);
    }
    return out;
  }
  return value;
}

/** List every {{expression}} found in a value (used for validation / debug). */
export function listExpressions(value, acc = []) {
  if (typeof value === 'string') {
    let m;
    EXPRESSION_RE.lastIndex = 0;
    while ((m = EXPRESSION_RE.exec(value)) !== null) {
      acc.push(m[1].trim());
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => listExpressions(v, acc));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => listExpressions(v, acc));
  }
  return acc;
}

/** Validate that every expression in a value is a safe path. */
export function validateExpressions(value) {
  const bad = listExpressions(value).filter((p) => !isSafePath(p));
  return { ok: bad.length === 0, invalid: bad };
}
