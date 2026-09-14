/**
 * FlowForge AI workflow execution engine.
 *
 * Pipeline:
 *  1. Load workflow (done by the caller / route)
 *  2. Validate workflow
 *  3. Build execution order (branch-aware traversal from trigger nodes)
 *  4. Execute nodes sequentially, passing outputs downstream
 *  5. Store execution state (done by the caller via persist helpers)
 *  6. Handle errors (per-node onError + retries)
 *  7. Stop when required (stop flag / failed without continue)
 *  8. Return the final execution result
 */
import { setTimeout as delay } from 'node:timers/promises';
import { validateWorkflow, TRIGGER_TYPES } from './validator.js';
import { buildContext } from './variables.js';
import { executeNode } from './nodeExecutors.js';

export const MAX_EXECUTION_MS = 55000;
export const MAX_STEPS = 200;

function outgoing(connections, nodeId, branch) {
  const all = connections.filter((c) => c.from === nodeId);
  if (branch === undefined || branch === null) {
    // Normal node: follow plain edges (plus generic output handles).
    return all.filter((c) => !c.sourceHandle || ['default', 'success', 'output'].includes(c.sourceHandle));
  }
  // Branching node: only the matching handle (plus explicit default fallback).
  const matching = all.filter((c) => c.sourceHandle === branch);
  if (matching.length > 0) return matching;
  return all.filter((c) => c.sourceHandle === 'default');
}

/**
 * Topological order (Kahn's algorithm) — used for validation views and tests.
 * Branch handles are ignored; every edge counts.
 */
export function buildExecutionOrder(definition) {
  const { nodes = [], connections = [] } = definition;
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const c of connections) {
    if (!indegree.has(c.from) || !indegree.has(c.to)) continue;
    adj.get(c.from).push(c.to);
    indegree.set(c.to, indegree.get(c.to) + 1);
  }
  const queue = nodes.filter((n) => (indegree.get(n.id) || 0) === 0).map((n) => n.id);
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return order;
}

function sleepCapped(ms) {
  const capped = Math.min(Math.max(Number(ms) || 0, 0), 5000);
  if (capped <= 0) return Promise.resolve();
  return delay(capped);
}

/**
 * Run a workflow definition.
 *
 * @param {object} definition { nodes, connections }
 * @param {object} opts
 *   - triggerData: data exposed as {{trigger.*}}
 *   - workflowInput: data exposed as {{workflow.input.*}}
 *   - startFromNodeId + priorNodeOutputs: resume support for retries
 *   - supabase, userId, workflowId, executionId: persistence context
 *   - deadlineMs: overall execution budget
 *   - onNodeComplete({ nodeId, result }): optional progress hook
 */
export async function runWorkflow(definition, opts = {}) {
  const startedAt = Date.now();
  const {
    triggerData = {},
    workflowInput = {},
    startFromNodeId = null,
    priorNodeOutputs = {},
    supabase = null,
    userId = null,
    workflowId = null,
    executionId = null,
    deadlineMs = MAX_EXECUTION_MS,
    onNodeComplete = null
  } = opts;

  const validation = validateWorkflow(definition);
  if (!validation.valid) {
    return {
      status: 'failed',
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      nodeResults: {},
      errors: validation.errors.map((message) => ({ message })),
      output: null,
      executionResponse: null
    };
  }

  const { nodes = [], connections = [] } = definition;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const context = buildContext({ triggerData, workflowInput, nodeOutputs: { ...priorNodeOutputs } });

  const nodeResults = {};
  const errors = [];
  let executionResponse = null;
  let lastOutput = null;
  let stopped = false;

  // Seed the traversal.
  let frontier;
  if (startFromNodeId) {
    if (!byId.has(startFromNodeId)) {
      return {
        status: 'failed',
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        nodeResults: {},
        errors: [{ message: `Retry start node "${startFromNodeId}" does not exist.` }],
        output: null,
        executionResponse: null
      };
    }
    frontier = [startFromNodeId];
  } else {
    frontier = nodes.filter((n) => TRIGGER_TYPES.includes(n.type)).map((n) => n.id);
  }

  const visited = new Set(Object.keys(priorNodeOutputs || {}));
  // When resuming, keep prior outputs but allow the start node to re-run.
  if (startFromNodeId) visited.delete(startFromNodeId);

  let steps = 0;
  const queue = [...frontier];

  while (queue.length > 0) {
    if (Date.now() - startedAt > deadlineMs) {
      errors.push({ message: `Execution time budget (${deadlineMs}ms) exceeded — stopping.` });
      stopped = true;
      break;
    }
    if (steps >= MAX_STEPS) {
      errors.push({ message: `Step limit (${MAX_STEPS}) reached — stopping.` });
      stopped = true;
      break;
    }
    const nodeId = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    steps += 1;

    const node = byId.get(nodeId);
    if (!node) continue;

    const retryCount = Math.min(Number(node.errorHandling?.retryCount) || 0, 5);
    const retryDelayMs = Number(node.errorHandling?.retryDelayMs) || 0;
    const onError = node.errorHandling?.onError || 'stop';

    const nodeStarted = Date.now();
    let attempts = 0;
    let succeeded = false;
    let output = null;
    let branch;
    let lastError = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      attempts = attempt + 1;
      // Per-attempt budget: whatever remains of the overall deadline.
      const remaining = deadlineMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        lastError = new Error('Execution time budget exceeded before node could run.');
        break;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, 60000));
      try {
        const result = await executeNode(node, {
          context,
          signal: controller.signal,
          supabase,
          userId,
          workflowId,
          executionId
        });
        output = result.output ?? null;
        branch = result.branch;
        if (result.response) executionResponse = result.response;
        if (result.stop) stopped = true;
        succeeded = true;
        lastError = null;
        clearTimeout(timer);
        break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const retryable = err?.retryable !== false;
        if (attempt < retryCount && retryable) {
          await sleepCapped(retryDelayMs);
        } else {
          break;
        }
      }
    }

    const durationMs = Date.now() - nodeStarted;
    if (succeeded) {
      context.nodes[node.id] = { output };
      lastOutput = output;
      nodeResults[node.id] = { status: 'success', output, attempts, durationMs };
    } else {
      const message = lastError?.message || 'Unknown node error.';
      errors.push({ nodeId: node.id, nodeType: node.type, message, attempts });
      nodeResults[node.id] = { status: 'failed', error: message, attempts, durationMs, output: null };
      if (onError === 'continue') {
        context.nodes[node.id] = { output: { _error: message } };
      } else {
        stopped = true;
      }
    }

    if (onNodeComplete) {
      try {
        await onNodeComplete({ nodeId: node.id, result: nodeResults[node.id] });
      } catch {
        // Progress hooks must never break execution.
      }
    }

    if (stopped && !(succeeded && branch !== undefined)) {
      if (stopped && succeeded) {
        // A `stop` flag still allows already-queued nodes? No — stop means stop.
      }
      // Only enqueue downstream nodes when we are not stopping for failure.
      if (!succeeded) break;
    }

    if (succeeded) {
      for (const conn of outgoing(connections, node.id, branch)) {
        if (!visited.has(conn.to)) queue.push(conn.to);
      }
    } else if (onError === 'continue') {
      for (const conn of outgoing(connections, node.id, undefined)) {
        if (!visited.has(conn.to)) queue.push(conn.to);
      }
    }

    if (stopped && succeeded) break;
  }

  const failed = Object.values(nodeResults).some((r) => r.status === 'failed' && errors.some((e) => e.nodeId && nodeResults[e.nodeId]?.status === 'failed'));
  const hasFatalError = errors.length > 0 && Object.values(nodeResults).some((r) => r.status === 'failed');
  const status = hasFatalError ? 'failed' : 'success';
  void failed;

  return {
    status,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    nodeResults,
    errors,
    output: lastOutput,
    executionResponse
  };
}

/** Find the first failed node id in a completed run (for retry support). */
export function findFirstFailedNode(nodeResults) {
  for (const [nodeId, result] of Object.entries(nodeResults || {})) {
    if (result?.status === 'failed') return nodeId;
  }
  return null;
}
