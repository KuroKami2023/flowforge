/**
 * FlowForge consolidated API — single serverless function.
 *
 * Hobby-plan note: Vercel Hobby allows max 12 functions per deployment, so
 * every /api/* route is dispatched from this one catch-all instead of living
 * in its own file. Routing below mirrors the original file layout exactly:
 *
 *   GET    /api/health
 *   POST   /api/ai/test
 *   GET    /api/cron/check-schedules
 *   GET    /api/dashboard/stats
 *   GET    /api/executions
 *   GET    /api/executions/:id
 *   POST   /api/executions/:id/retry
 *   POST   /api/webhooks/:workflowId
 *   GET    /api/workflows
 *   POST   /api/workflows
 *   GET    /api/workflows/:id
 *   PUT    /api/workflows/:id
 *   DELETE /api/workflows/:id
 *   POST   /api/workflows/:id/duplicate
 *   POST   /api/workflows/:id/execute
 *   GET    /api/workflows/:id/schedule
 *   PUT    /api/workflows/:id/schedule
 *   DELETE /api/workflows/:id/schedule
 *   GET    /api/workflows/:id/webhook
 *   POST   /api/workflows/:id/webhook
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getUserFromRequest, requireMethod, send } from './_lib/auth.js';
import { getAdminClient } from './_lib/supabaseAdmin.js';
import { rateLimitMiddleware } from './_lib/rateLimit.js';
import { runWorkflow, findFirstFailedNode } from './_lib/executionEngine.js';
import {
  createExecutionRow,
  persistNodeResult,
  finishExecutionRow,
  mirrorGraph
} from './_lib/persist.js';
import { validateWorkflow, validateWorkflowMeta } from './_lib/validator.js';
import { chatCompletion } from './_lib/nvidiaAI.js';

/* ---------------- health ---------------- */

async function hHealth(req, res) {
  if (!requireMethod(req, res, ['GET'])) return;
  send(res, 200, {
    ok: true,
    service: 'flowforge-ai',
    time: new Date().toISOString(),
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
  });
}

/* ---------------- ai/test ----------------
 * POST /api/ai/test — authenticated smoke-test for the NVIDIA integration.
 * Body: { prompt, system?, temperature?, maxTokens? }
 */

async function hAiTest(req, res) {
  if (!rateLimitMiddleware(req, res, 'ai-test', { max: 10, windowMs: 60000 })) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed. Use POST.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const prompt = String(req.body?.prompt || '').slice(0, 2000);
  if (!prompt) return send(res, 400, { error: 'prompt is required.' });

  try {
    const text = await chatCompletion(
      {
        system: String(req.body?.system || 'You are a helpful assistant.').slice(0, 2000),
        prompt,
        temperature: req.body?.temperature ?? 0.3,
        maxTokens: Math.min(Number(req.body?.maxTokens) || 256, 1024),
        jsonMode: false
      },
      { timeoutMs: 45000 }
    );
    return send(res, 200, { ok: true, model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', text });
  } catch (err) {
    const status = err?.status === 401 || err?.code === 'NVIDIA_KEY_MISSING' ? 500 : 502;
    return send(res, status, { ok: false, error: err.message });
  }
}

/* ---------------- cron/check-schedules ----------------
 * GET /api/cron/check-schedules — free-tier scheduler. An external pinger
 * (cron-job.org, UptimeRobot, or Vercel Pro cron) hits this route, which runs
 * every enabled schedule whose next_run_at has passed, then advances
 * next_run_at by every_minutes. Protect with CRON_SECRET (?secret= or
 * Authorization header).
 */

async function hCronCheck(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed. Use GET.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });

  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided = req.query.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (provided !== expected) return send(res, 401, { error: 'Invalid cron secret.' });
  }

  const now = new Date();
  const { data: due, error } = await supabase
    .from('workflow_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .limit(10);
  if (error) return send(res, 500, { error: error.message });

  const results = [];
  for (const schedule of due || []) {
    const { data: workflow } = await supabase.from('workflows').select('*').eq('id', schedule.workflow_id).single();
    if (!workflow || workflow.enabled === false) {
      results.push({ scheduleId: schedule.id, skipped: 'workflow missing or disabled' });
      continue;
    }
    try {
      const execution = await createExecutionRow(supabase, {
        workflowId: workflow.id,
        userId: workflow.user_id,
        triggerType: 'schedule',
        input: {}
      });
      const run = await runWorkflow(workflow.definition || { nodes: [], connections: [] }, {
        triggerData: { scheduledAt: now.toISOString() },
        workflowInput: {},
        supabase,
        userId: workflow.user_id,
        workflowId: workflow.id,
        executionId: execution.id,
        deadlineMs: 50000,
        onNodeComplete: async ({ nodeId, result }) => {
          const node = (workflow.definition?.nodes || []).find((n) => n.id === nodeId) || { id: nodeId, type: 'unknown' };
          await persistNodeResult(supabase, execution.id, node, result);
        }
      });
      await finishExecutionRow(supabase, execution.id, run);
      results.push({ scheduleId: schedule.id, executionId: execution.id, status: run.status });
    } catch (e) {
      results.push({ scheduleId: schedule.id, error: e.message });
    }
    const every = Math.min(Math.max(Number(schedule.every_minutes) || 60, 5), 1440);
    await supabase
      .from('workflow_schedules')
      .update({
        last_run_at: now.toISOString(),
        next_run_at: new Date(now.getTime() + every * 60000).toISOString()
      })
      .eq('id', schedule.id);
  }

  return send(res, 200, { checkedAt: now.toISOString(), ran: results.length, results });
}

/* ---------------- dashboard/stats ---------------- */

async function hDashboardStats(req, res) {
  if (!rateLimitMiddleware(req, res, 'dashboard')) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed. Use GET.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const [{ data: workflows }, { data: executions }] = await Promise.all([
    supabase.from('workflows').select('id, enabled').eq('user_id', user.id),
    supabase
      .from('workflow_executions')
      .select('id, workflow_id, status, duration_ms, started_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(200)
  ]);

  const totalWorkflows = (workflows || []).length;
  const activeWorkflows = (workflows || []).filter((w) => w.enabled).length;
  const rows = executions || [];
  const successful = rows.filter((e) => e.status === 'success').length;
  const failed = rows.filter((e) => e.status === 'failed').length;
  const durations = rows.map((e) => e.duration_ms).filter((d) => typeof d === 'number');
  const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  return send(res, 200, {
    stats: {
      totalWorkflows,
      activeWorkflows,
      totalExecutions: rows.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      averageExecutionMs: avgMs
    },
    recentExecutions: rows.slice(0, 10)
  });
}

/* ---------------- executions ---------------- */

async function hExecutionsList(req, res) {
  if (!rateLimitMiddleware(req, res, 'executions')) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed. Use GET.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { workflowId, status, limit = '20' } = req.query;
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  let query = supabase
    .from('workflow_executions')
    .select('id, workflow_id, status, trigger_type, started_at, ended_at, duration_ms, error')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(take);
  if (workflowId) query = query.eq('workflow_id', workflowId);
  if (status && ['success', 'failed', 'running'].includes(status)) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return send(res, 500, { error: error.message });

  const ids = [...new Set((data || []).map((e) => e.workflow_id))];
  let names = {};
  if (ids.length > 0) {
    const { data: wf } = await supabase.from('workflows').select('id, name').in('id', ids);
    names = Object.fromEntries((wf || []).map((w) => [w.id, w.name]));
  }
  return send(res, 200, {
    executions: (data || []).map((e) => ({ ...e, workflow_name: names[e.workflow_id] || 'Deleted workflow' }))
  });
}

async function hExecutionGet(req, res) {
  if (!rateLimitMiddleware(req, res, 'execution-detail')) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed. Use GET.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: execution } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!execution) return send(res, 404, { error: 'Execution not found.' });

  const { data: nodes } = await supabase
    .from('workflow_execution_nodes')
    .select('*')
    .eq('execution_id', id)
    .order('started_at', { ascending: true });

  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, name')
    .eq('id', execution.workflow_id)
    .single();

  return send(res, 200, {
    execution,
    nodes: nodes || [],
    workflowName: workflow?.name || 'Deleted workflow'
  });
}

async function hExecutionRetry(req, res) {
  if (!rateLimitMiddleware(req, res, 'execution-retry', { max: 20, windowMs: 60000 })) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed. Use POST.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: original } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!original) return send(res, 404, { error: 'Execution not found.' });
  if (original.status !== 'failed') {
    return send(res, 400, { error: 'Only failed executions can be retried.' });
  }

  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', original.workflow_id)
    .eq('user_id', user.id)
    .single();
  if (!workflow) return send(res, 404, { error: 'Workflow not found.' });

  const { data: nodeRows } = await supabase
    .from('workflow_execution_nodes')
    .select('*')
    .eq('execution_id', id);

  const priorNodeOutputs = {};
  for (const row of nodeRows || []) {
    if (row.status === 'success') priorNodeOutputs[row.node_id] = { output: row.output };
  }
  const failedNodeId = findFirstFailedNode(
    Object.fromEntries((nodeRows || []).map((r) => [r.node_id, { status: r.status }]))
  );
  if (!failedNodeId) return send(res, 400, { error: 'No failed node found in this execution.' });

  const retry = await createExecutionRow(supabase, {
    workflowId: workflow.id,
    userId: user.id,
    triggerType: original.trigger_type || 'retry',
    input: original.input || {}
  });

  const run = await runWorkflow(workflow.definition || { nodes: [], connections: [] }, {
    triggerData: original.input || {},
    workflowInput: original.input || {},
    startFromNodeId: failedNodeId,
    priorNodeOutputs,
    supabase,
    userId: user.id,
    workflowId: workflow.id,
    executionId: retry.id,
    onNodeComplete: async ({ nodeId, result }) => {
      const node = (workflow.definition?.nodes || []).find((n) => n.id === nodeId) || { id: nodeId, type: 'unknown' };
      await persistNodeResult(supabase, retry.id, node, result);
    }
  });

  await finishExecutionRow(supabase, retry.id, run);
  return send(res, 200, {
    executionId: retry.id,
    retriedFrom: failedNodeId,
    status: run.status,
    output: run.output,
    errors: run.errors,
    durationMs: run.durationMs,
    nodeResults: run.nodeResults
  });
}

/* ---------------- webhooks/:workflowId ---------------- */

function secretsMatch(provided, expected) {
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function hWebhookIngress(req, res) {
  if (!rateLimitMiddleware(req, res, 'webhook-ingress', { max: 60, windowMs: 60000 })) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed. Use POST.' });

  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });

  const { workflowId } = req.query;
  if (!workflowId) return send(res, 400, { error: 'Workflow id is required.' });

  const { data: workflow } = await supabase.from('workflows').select('*').eq('id', workflowId).single();
  if (!workflow || workflow.enabled === false) {
    return send(res, 404, { error: 'Webhook not found or workflow is disabled.' });
  }

  const { data: endpoint } = await supabase.from('webhook_endpoints').select('*').eq('workflow_id', workflowId).single();
  if (endpoint && endpoint.enabled === false) {
    return send(res, 404, { error: 'Webhook endpoint is disabled.' });
  }
  const provided = req.headers['x-webhook-secret'] || req.query.secret;
  if (endpoint?.secret && !secretsMatch(provided, endpoint.secret)) {
    return send(res, 401, { error: 'Invalid webhook secret.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(body).length > 256 * 1024) {
    return send(res, 413, { error: 'Webhook payload exceeds 256KB.' });
  }

  const triggerData = { body, query: req.query || {}, headers: { 'content-type': req.headers['content-type'] || '' } };

  let execution;
  try {
    execution = await createExecutionRow(supabase, {
      workflowId,
      userId: workflow.user_id,
      triggerType: 'webhook',
      input: body
    });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }

  const run = await runWorkflow(workflow.definition || { nodes: [], connections: [] }, {
    triggerData,
    workflowInput: body,
    supabase,
    userId: workflow.user_id,
    workflowId,
    executionId: execution.id,
    onNodeComplete: async ({ nodeId, result }) => {
      const node = (workflow.definition?.nodes || []).find((n) => n.id === nodeId) || { id: nodeId, type: 'unknown' };
      await persistNodeResult(supabase, execution.id, node, result);
    }
  });

  await finishExecutionRow(supabase, execution.id, run);

  if (run.executionResponse) {
    return send(res, run.executionResponse.status || 200, run.executionResponse.body ?? { ok: true });
  }
  return send(res, 200, {
    executionId: execution.id,
    status: run.status,
    output: run.output,
    errors: run.errors
  });
}

/* ---------------- workflows ---------------- */

function emptyDefinition() {
  return { nodes: [], connections: [] };
}

async function hWorkflows(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflows')) return;
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });

  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('workflows')
      .select('id, name, description, enabled, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { workflows: data });
  }

  if (req.method === 'POST') {
    const { name, description = '', definition = emptyDefinition(), enabled = true } = req.body || {};
    const meta = validateWorkflowMeta({ name, description, enabled });
    if (!meta.valid) return send(res, 400, { error: meta.errors.join(' ') });
    if (definition?.nodes?.length > 0) {
      const v = validateWorkflow(definition);
      if (!v.valid) return send(res, 400, { error: 'Invalid workflow.', details: v.errors });
    }
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description,
        definition,
        enabled
      })
      .select('*')
      .single();
    if (error) return send(res, 500, { error: error.message });
    try {
      await mirrorGraph(supabase, data.id, definition);
    } catch (e) {
      return send(res, 201, { workflow: data, warning: e.message });
    }
    return send(res, 201, { workflow: data });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

async function loadOwnedWorkflow(supabase, id, userId) {
  const { data, error } = await supabase.from('workflows').select('*').eq('id', id).eq('user_id', userId).single();
  if (error || !data) return null;
  return data;
}

async function hWorkflowDetail(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflow-detail')) return;
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  if (!id) return send(res, 400, { error: 'Workflow id is required.' });

  if (req.method === 'GET') {
    const workflow = await loadOwnedWorkflow(supabase, id, user.id);
    if (!workflow) return send(res, 404, { error: 'Workflow not found.' });
    return send(res, 200, { workflow });
  }

  if (req.method === 'PUT') {
    const workflow = await loadOwnedWorkflow(supabase, id, user.id);
    if (!workflow) return send(res, 404, { error: 'Workflow not found.' });
    const { name, description, definition, enabled } = req.body || {};
    const meta = validateWorkflowMeta({ name, description, enabled });
    if (!meta.valid) return send(res, 400, { error: meta.errors.join(' ') });
    if (definition !== undefined) {
      if (definition?.nodes?.length > 0) {
        const v = validateWorkflow(definition);
        if (!v.valid) return send(res, 400, { error: 'Invalid workflow.', details: v.errors });
      }
    }
    const patch = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name.trim();
    if (description !== undefined) patch.description = description;
    if (definition !== undefined) patch.definition = definition;
    if (enabled !== undefined) patch.enabled = enabled;
    const { data, error } = await supabase
      .from('workflows')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) return send(res, 500, { error: error.message });
    if (definition !== undefined) {
      try {
        await mirrorGraph(supabase, id, definition);
      } catch (e) {
        return send(res, 200, { workflow: data, warning: e.message });
      }
    }
    return send(res, 200, { workflow: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('workflows').delete().eq('id', id).eq('user_id', user.id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { deleted: true });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

async function hWorkflowDuplicate(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflow-duplicate')) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed. Use POST.' });
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!workflow) return send(res, 404, { error: 'Workflow not found.' });

  const { data, error } = await supabase
    .from('workflows')
    .insert({
      user_id: user.id,
      name: `${workflow.name} (copy)`.slice(0, 120),
      description: workflow.description,
      definition: workflow.definition,
      enabled: false
    })
    .select('*')
    .single();
  if (error) return send(res, 500, { error: error.message });
  try {
    await mirrorGraph(supabase, data.id, data.definition || { nodes: [], connections: [] });
  } catch {
    // non-fatal
  }
  return send(res, 201, { workflow: data });
}

async function hWorkflowExecute(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflow-execute', { max: 20, windowMs: 60000 })) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed. Use POST.' });

  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!workflow) return send(res, 404, { error: 'Workflow not found.' });

  const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
  let execution;
  try {
    execution = await createExecutionRow(supabase, {
      workflowId: id,
      userId: user.id,
      triggerType: 'manual',
      input
    });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }

  const run = await runWorkflow(workflow.definition || { nodes: [], connections: [] }, {
    triggerData: input,
    workflowInput: input,
    supabase,
    userId: user.id,
    workflowId: id,
    executionId: execution.id,
    onNodeComplete: async ({ nodeId, result }) => {
      const node = (workflow.definition?.nodes || []).find((n) => n.id === nodeId) || { id: nodeId, type: 'unknown' };
      await persistNodeResult(supabase, execution.id, node, result);
    }
  });

  try {
    await finishExecutionRow(supabase, execution.id, run);
  } catch (e) {
    return send(res, 500, { error: e.message, executionId: execution.id });
  }

  const responseStatus = run.executionResponse?.status || 200;
  return send(res, responseStatus, {
    executionId: execution.id,
    status: run.status,
    output: run.output,
    errors: run.errors,
    durationMs: run.durationMs,
    nodeResults: run.nodeResults
  });
}

async function hWorkflowSchedule(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflow-schedule')) return;
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!workflow) return send(res, 404, { error: 'Workflow not found.' });

  if (req.method === 'GET') {
    const { data } = await supabase.from('workflow_schedules').select('*').eq('workflow_id', id).single();
    return send(res, 200, { schedule: data || null });
  }

  if (req.method === 'PUT') {
    const everyMinutes = Number(req.body?.everyMinutes);
    const enabled = req.body?.enabled !== false;
    if (!Number.isInteger(everyMinutes) || everyMinutes < 5 || everyMinutes > 1440) {
      return send(res, 400, { error: 'everyMinutes must be an integer between 5 and 1440.' });
    }
    const nextRun = new Date(Date.now() + everyMinutes * 60000).toISOString();
    const { data: existing } = await supabase.from('workflow_schedules').select('id').eq('workflow_id', id).single();
    if (existing) {
      const { data, error } = await supabase
        .from('workflow_schedules')
        .update({ cron: String(everyMinutes), every_minutes: everyMinutes, enabled, next_run_at: nextRun })
        .eq('workflow_id', id)
        .select('*')
        .single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { schedule: data });
    }
    const { data, error } = await supabase
      .from('workflow_schedules')
      .insert({
        workflow_id: id,
        user_id: user.id,
        cron: String(everyMinutes),
        every_minutes: everyMinutes,
        enabled,
        next_run_at: nextRun
      })
      .select('*')
      .single();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 201, { schedule: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('workflow_schedules').delete().eq('workflow_id', id);
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, { deleted: true });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

async function hWorkflowWebhook(req, res) {
  if (!rateLimitMiddleware(req, res, 'workflow-webhook')) return;
  const supabase = getAdminClient();
  if (!supabase) return send(res, 500, { error: 'Server database is not configured.' });
  const { user } = await getUserFromRequest(req);
  if (!user) return send(res, 401, { error: 'Authentication required.' });

  const { id } = req.query;
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!workflow) return send(res, 404, { error: 'Workflow not found.' });

  const { data: existing } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('workflow_id', id)
    .single();

  if (req.method === 'GET') {
    if (existing) {
      return send(res, 200, {
        webhook: {
          workflowId: id,
          path: `/api/webhooks/${id}`,
          enabled: existing.enabled,
          hasSecret: Boolean(existing.secret)
        }
      });
    }
    const secret = randomBytes(24).toString('hex');
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .insert({ workflow_id: id, user_id: user.id, secret, enabled: true })
      .select('*')
      .single();
    if (error) return send(res, 500, { error: error.message });
    return send(res, 200, {
      webhook: { workflowId: id, path: `/api/webhooks/${id}`, enabled: data.enabled, hasSecret: true }
    });
  }

  if (req.method === 'POST') {
    const secret = randomBytes(24).toString('hex');
    if (existing) {
      const { error } = await supabase.from('webhook_endpoints').update({ secret }).eq('workflow_id', id);
      if (error) return send(res, 500, { error: error.message });
    } else {
      const { error } = await supabase
        .from('webhook_endpoints')
        .insert({ workflow_id: id, user_id: user.id, secret, enabled: true });
      if (error) return send(res, 500, { error: error.message });
    }
    return send(res, 200, { rotated: true, hint: 'Pass the secret as X-Webhook-Secret header when calling the webhook.' });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

/* ---------------- router ---------------- */

function parseQuery(searchParams) {
  const q = {};
  for (const [k, v] of searchParams) {
    if (q[k] === undefined) q[k] = v;
    else if (Array.isArray(q[k])) q[k].push(v);
    else q[k] = [q[k], v];
  }
  return q;
}

function decodeGroups(match) {
  const out = {};
  if (match.groups) {
    for (const [k, v] of Object.entries(match.groups)) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

const SEG = '[^/]+';
const ROUTES = [
  { methods: ['GET'], pattern: /^\/api\/health\/?$/, handler: hHealth },
  { methods: ['POST'], pattern: /^\/api\/ai\/test\/?$/, handler: hAiTest },
  { methods: ['GET'], pattern: /^\/api\/cron\/check-schedules\/?$/, handler: hCronCheck },
  { methods: ['GET'], pattern: /^\/api\/dashboard\/stats\/?$/, handler: hDashboardStats },
  { methods: ['GET'], pattern: /^\/api\/executions\/?$/, handler: hExecutionsList },
  { methods: ['GET'], pattern: new RegExp(`^/api/executions/(?<id>${SEG})/?$`), handler: hExecutionGet },
  { methods: ['POST'], pattern: new RegExp(`^/api/executions/(?<id>${SEG})/retry/?$`), handler: hExecutionRetry },
  { methods: ['POST'], pattern: new RegExp(`^/api/webhooks/(?<workflowId>${SEG})/?$`), handler: hWebhookIngress },
  { methods: ['GET', 'POST'], pattern: /^\/api\/workflows\/?$/, handler: hWorkflows },
  { methods: ['GET', 'PUT', 'DELETE'], pattern: new RegExp(`^/api/workflows/(?<id>${SEG})/?$`), handler: hWorkflowDetail },
  { methods: ['POST'], pattern: new RegExp(`^/api/workflows/(?<id>${SEG})/duplicate/?$`), handler: hWorkflowDuplicate },
  { methods: ['POST'], pattern: new RegExp(`^/api/workflows/(?<id>${SEG})/execute/?$`), handler: hWorkflowExecute },
  { methods: ['GET', 'PUT', 'DELETE'], pattern: new RegExp(`^/api/workflows/(?<id>${SEG})/schedule/?$`), handler: hWorkflowSchedule },
  { methods: ['GET', 'POST'], pattern: new RegExp(`^/api/workflows/(?<id>${SEG})/webhook/?$`), handler: hWorkflowWebhook }
];

export function matchRoute(method, pathname) {
  const m = String(method || 'GET').toUpperCase();
  for (const route of ROUTES) {
    if (!route.methods.includes(m)) continue;
    const match = String(pathname || '/').match(route.pattern);
    if (match) return { handler: route.handler, params: decodeGroups(match) };
  }
  return null;
}

export default async function handler(req, res) {
  let pathname = '/';
  let query = {};
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = url.pathname || '/';
    query = parseQuery(url.searchParams);
  } catch {
    pathname = String(req.url || '/').split('?')[0];
  }
  const method = String(req.method || 'GET').toUpperCase();

  const hit = matchRoute(method, pathname);
  if (hit) {
    req.query = { ...query, ...hit.params };
    try {
      return await hit.handler(req, res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[api] ${method} ${pathname} failed:`, err);
      if (!res.headersSent) return send(res, 500, { error: 'Internal server error.' });
      return undefined;
    }
  }
  return send(res, 404, { error: 'Not found.' });
}
