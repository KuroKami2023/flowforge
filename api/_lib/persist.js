/** Persistence helpers for executions (Supabase admin client). */

export async function createExecutionRow(supabase, { workflowId, userId, triggerType, input }) {
  const { data, error } = await supabase
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: 'running',
      trigger_type: triggerType || 'manual',
      input: input ?? {}
    })
    .select('id, started_at')
    .single();
  if (error) throw new Error(`Could not create execution record: ${error.message}`);
  return data;
}

export async function persistNodeResult(supabase, executionId, node, result) {
  const row = {
    execution_id: executionId,
    node_id: node.id,
    node_type: node.type,
    status: result.status,
    output: result.output !== undefined ? result.output : null,
    error: result.error || null,
    attempts: result.attempts || 1,
    duration_ms: result.durationMs || 0
  };
  const { error } = await supabase.from('workflow_execution_nodes').insert(row);
  if (error) throw new Error(`Could not persist node result: ${error.message}`);
}

export async function finishExecutionRow(supabase, executionId, run) {
  const { error } = await supabase
    .from('workflow_executions')
    .update({
      status: run.status,
      output: run.output ?? null,
      ended_at: run.endedAt,
      duration_ms: run.durationMs,
      error: run.errors.length > 0 ? run.errors.map((e) => e.nodeId ? `${e.nodeId}: ${e.message}` : e.message).join(' | ').slice(0, 2000) : null
    })
    .eq('id', executionId);
  if (error) throw new Error(`Could not finish execution record: ${error.message}`);
}

/** Mirror the canonical definition into workflow_nodes / workflow_connections. */
export async function mirrorGraph(supabase, workflowId, definition) {
  const { nodes = [], connections = [] } = definition;
  const { error: delConn } = await supabase.from('workflow_connections').delete().eq('workflow_id', workflowId);
  if (delConn) throw new Error(`Could not replace connections: ${delConn.message}`);
  const { error: delNodes } = await supabase.from('workflow_nodes').delete().eq('workflow_id', workflowId);
  if (delNodes) throw new Error(`Could not replace nodes: ${delNodes.message}`);

  if (nodes.length > 0) {
    const { error } = await supabase.from('workflow_nodes').insert(
      nodes.map((n) => ({
        workflow_id: workflowId,
        node_id: n.id,
        type: n.type,
        config: n.config || {},
        input_mapping: n.inputMapping || {},
        output_mapping: n.outputMapping || {},
        position: n.position || { x: 0, y: 0 },
        error_handling: n.errorHandling || { onError: 'stop', retryCount: 0, retryDelayMs: 0 }
      }))
    );
    if (error) throw new Error(`Could not save nodes: ${error.message}`);
  }
  if (connections.length > 0) {
    const { error } = await supabase.from('workflow_connections').insert(
      connections.map((c) => ({
        workflow_id: workflowId,
        from_node: c.from,
        to_node: c.to,
        source_handle: c.sourceHandle || null,
        label: c.label || null
      }))
    );
    if (error) throw new Error(`Could not save connections: ${error.message}`);
  }
}
