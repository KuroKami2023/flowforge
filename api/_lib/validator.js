/**
 * Workflow validation — runs before save and before every execution.
 * Pure functions with no side effects so tests and routes share them.
 */

export const NODE_TYPES = [
  // Triggers
  'manual_trigger',
  'webhook_trigger',
  'schedule_trigger',
  // Data
  'set_value',
  'json_parser',
  'transform_data',
  'filter',
  'formatter',
  'condition',
  'switch',
  'loop',
  // HTTP
  'http_request',
  'webhook_response',
  // AI
  'ai_generation',
  'ai_classification',
  'ai_extraction',
  'ai_summarization',
  'ai_data_transformation',
  // Output
  'save_to_database',
  'csv_export'
];

export const TRIGGER_TYPES = ['manual_trigger', 'webhook_trigger', 'schedule_trigger'];

const MAX_NODES = 50;
const MAX_CONNECTIONS = 100;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function validateWorkflow(definition) {
  const errors = [];
  if (!isPlainObject(definition)) {
    return { valid: false, errors: ['Workflow definition must be an object.'] };
  }
  const { nodes = [], connections = [] } = definition;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push('Workflow must contain at least one node.');
  }
  if (nodes.length > MAX_NODES) {
    errors.push(`Workflow exceeds the free-tier limit of ${MAX_NODES} nodes.`);
  }
  if (!Array.isArray(connections)) {
    errors.push('Workflow connections must be an array.');
  } else if (connections.length > MAX_CONNECTIONS) {
    errors.push(`Workflow exceeds the free-tier limit of ${MAX_CONNECTIONS} connections.`);
  }

  const ids = new Set();
  for (const node of nodes) {
    if (!isPlainObject(node)) {
      errors.push('Every node must be an object.');
      continue;
    }
    if (!node.id || typeof node.id !== 'string') {
      errors.push('Every node must have a string id.');
      continue;
    }
    if (ids.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    ids.add(node.id);

    if (!NODE_TYPES.includes(node.type)) {
      errors.push(`Node "${node.id}" has unknown type "${node.type}".`);
    }
    if (node.config !== undefined && !isPlainObject(node.config)) {
      errors.push(`Node "${node.id}" config must be an object.`);
    }
    if (node.inputMapping !== undefined && !isPlainObject(node.inputMapping)) {
      errors.push(`Node "${node.id}" inputMapping must be an object.`);
    }
    if (node.outputMapping !== undefined && !isPlainObject(node.outputMapping)) {
      errors.push(`Node "${node.id}" outputMapping must be an object.`);
    }
    const eh = node.errorHandling || {};
    if (eh.onError !== undefined && !['stop', 'continue'].includes(eh.onError)) {
      errors.push(`Node "${node.id}" errorHandling.onError must be "stop" or "continue".`);
    }
    if (eh.retryCount !== undefined && (!Number.isInteger(eh.retryCount) || eh.retryCount < 0 || eh.retryCount > 5)) {
      errors.push(`Node "${node.id}" retryCount must be an integer between 0 and 5.`);
    }
    if (eh.retryDelayMs !== undefined && (!Number.isInteger(eh.retryDelayMs) || eh.retryDelayMs < 0 || eh.retryDelayMs > 10000)) {
      errors.push(`Node "${node.id}" retryDelayMs must be between 0 and 10000.`);
    }
  }

  const triggers = nodes.filter((n) => TRIGGER_TYPES.includes(n.type));
  if (nodes.length > 0 && triggers.length === 0) {
    errors.push('Workflow must contain at least one trigger node.');
  }

  for (const conn of connections || []) {
    if (!isPlainObject(conn) || !conn.from || !conn.to) {
      errors.push('Every connection must have "from" and "to" node ids.');
      continue;
    }
    if (!ids.has(conn.from)) errors.push(`Connection references unknown source node "${conn.from}".`);
    if (!ids.has(conn.to)) errors.push(`Connection references unknown target node "${conn.to}".`);
    if (conn.from === conn.to) errors.push(`Node "${conn.from}" cannot connect to itself.`);
    const target = nodes.find((n) => n.id === conn.to);
    if (target && TRIGGER_TYPES.includes(target.type)) {
      errors.push(`Trigger node "${conn.to}" cannot have incoming connections.`);
    }
  }

  // Cycle detection (DFS over adjacency).
  if (errors.length === 0) {
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const c of connections) adj.get(c.from)?.push(c.to);
    const visiting = new Set();
    const visited = new Set();
    let hasCycle = false;
    const dfs = (id) => {
      if (visiting.has(id)) {
        hasCycle = true;
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const next of adj.get(id) || []) dfs(next);
      visiting.delete(id);
      visited.add(id);
    };
    for (const n of nodes) dfs(n.id);
    if (hasCycle) errors.push('Workflow contains a cycle. Loops must use the Loop node, not circular connections.');
  }

  // Per-type required config checks.
  for (const node of nodes) {
    if (!isPlainObject(node) || !node.id) continue;
    const config = node.config || {};
    switch (node.type) {
      case 'http_request':
        if (!config.url || typeof config.url !== 'string') {
          errors.push(`Node "${node.id}" (http_request) requires config.url.`);
        }
        break;
      case 'ai_classification':
        if (!config.categories || !Array.isArray(config.categories) || config.categories.length === 0) {
          errors.push(`Node "${node.id}" (ai_classification) requires config.categories (non-empty array).`);
        }
        break;
      case 'ai_extraction':
        if (!config.schema || !isPlainObject(config.schema)) {
          errors.push(`Node "${node.id}" (ai_extraction) requires config.schema (JSON schema object).`);
        }
        break;
      case 'condition':
        if (!config.conditions || !Array.isArray(config.conditions) || config.conditions.length === 0) {
          errors.push(`Node "${node.id}" (condition) requires config.conditions (non-empty array).`);
        }
        break;
      case 'switch':
        if (!config.cases || !Array.isArray(config.cases) || config.cases.length === 0) {
          errors.push(`Node "${node.id}" (switch) requires config.cases (non-empty array).`);
        }
        break;
      default:
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Basic sanitisation for workflow metadata supplied by users. */
export function validateWorkflowMeta({ name, description, enabled }) {
  const errors = [];
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 120)) {
    errors.push('Workflow name must be a non-empty string up to 120 characters.');
  }
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000)) {
    errors.push('Workflow description must be a string up to 2000 characters.');
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    errors.push('Workflow enabled flag must be a boolean.');
  }
  return { valid: errors.length === 0, errors };
}
