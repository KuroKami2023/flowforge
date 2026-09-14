/**
 * Node palette metadata for the visual builder.
 * `fields` drive the generic ConfigPanel. Kinds:
 * text | textarea | number | checkbox | select | keyvalue | json |
 * lines | columns | conditions | cases | info
 */

export const OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
  'exists'
];

export const NODE_DEFINITIONS = {
  manual_trigger: {
    label: 'Manual Trigger', category: 'Triggers', color: '#16a34a',
    description: 'Start a run by hand with a JSON input payload.',
    fields: [{ key: '_info', kind: 'info', text: 'Runs expose your input as {{trigger.*}} and {{workflow.input.*}}.' }]
  },
  webhook_trigger: {
    label: 'Webhook Trigger', category: 'Triggers', color: '#16a34a',
    description: 'Start a run from POST /api/webhooks/{workflowId}.',
    fields: [{ key: '_info', kind: 'info', text: 'Payload is available as {{trigger.body}}. Manage the endpoint URL in the builder toolbar.' }]
  },
  schedule_trigger: {
    label: 'Schedule Trigger', category: 'Triggers', color: '#16a34a',
    description: 'Start a run on an interval (free-tier polling).',
    fields: [{ key: '_info', kind: 'info', text: 'Configure the interval in the builder toolbar. Runs at most every 5 minutes on the free tier.' }]
  },
  set_value: {
    label: 'Set Value', category: 'Data', color: '#2563eb',
    description: 'Build an object from key/template pairs.',
    defaultConfig: { values: { full_name: '{{trigger.name}}' } },
    fields: [{ key: 'values', label: 'Values', kind: 'keyvalue' }]
  },
  json_parser: {
    label: 'JSON Parser', category: 'Data', color: '#2563eb',
    description: 'Parse a JSON string into an object.',
    defaultConfig: { input: '{{trigger.raw_json}}' },
    fields: [{ key: 'input', label: 'JSON string', kind: 'textarea', placeholder: '{{trigger.raw_json}}' }]
  },
  transform_data: {
    label: 'Transform Data', category: 'Data', color: '#2563eb',
    description: 'Reshape data with safe predefined operations.',
    defaultConfig: { input: '{{trigger.data}}', operations: [{ op: 'pick', fields: ['name'] }] },
    fields: [
      { key: 'input', label: 'Input (variable or JSON)', kind: 'textarea', placeholder: '{{nodes.previous.output}}' },
      { key: 'operations', label: 'Operations (JSON array: pick, omit, rename, set, merge, flatten, sort_by, unique_by)', kind: 'json' }
    ]
  },
  filter: {
    label: 'Filter', category: 'Data', color: '#2563eb',
    description: 'Keep array rows that match conditions.',
    defaultConfig: { input: '{{nodes.previous.output.items}}', logic: 'and', conditions: [{ field: 'age', operator: 'gte', value: 18 }] },
    fields: [
      { key: 'input', label: 'Input array', kind: 'text', placeholder: '{{nodes.parse.output.users}}' },
      { key: 'logic', label: 'Match', kind: 'select', options: ['and', 'or'] },
      { key: 'conditions', label: 'Conditions', kind: 'conditions' }
    ]
  },
  formatter: {
    label: 'Formatter', category: 'Data', color: '#2563eb',
    description: 'Render a text template with {{variables}}.',
    defaultConfig: { template: 'Hello {{trigger.name}}!' },
    fields: [{ key: 'template', label: 'Template', kind: 'textarea' }]
  },
  condition: {
    label: 'Condition', category: 'Data', color: '#7c3aed',
    description: 'Branch true/false on conditions.',
    handles: { outputs: ['true', 'false'] },
    defaultConfig: { logic: 'and', conditions: [{ left: '{{trigger.status}}', operator: 'equals', right: 'paid' }] },
    fields: [
      { key: 'logic', label: 'Match', kind: 'select', options: ['and', 'or'] },
      { key: 'conditions', label: 'Conditions', kind: 'conditions', leftKey: 'left', rightKey: 'right' }
    ]
  },
  switch: {
    label: 'Switch', category: 'Data', color: '#7c3aed',
    description: 'Route to the case matching the input value.',
    handles: { outputs: 'dynamic' },
    defaultConfig: { input: '{{trigger.plan}}', cases: [{ id: 'pro', value: 'pro' }, { id: 'free', value: 'free' }] },
    fields: [
      { key: 'input', label: 'Input value', kind: 'text' },
      { key: 'cases', label: 'Cases (id + matching value, plus automatic "default")', kind: 'cases' }
    ]
  },
  loop: {
    label: 'Loop', category: 'Data', color: '#7c3aed',
    description: 'Map over an array with a template or safe operations.',
    defaultConfig: { items: '{{trigger.items}}', maxIterations: 100, itemTemplate: { value: '{{loop.item}}' }, operations: [] },
    fields: [
      { key: 'items', label: 'Items array', kind: 'textarea' },
      { key: 'maxIterations', label: 'Max iterations (≤500)', kind: 'number' },
      { key: 'itemTemplate', label: 'Item template (optional, uses {{loop.item}} / {{loop.index}})', kind: 'json' },
      { key: 'operations', label: 'Operations per item (optional)', kind: 'json' }
    ]
  },
  http_request: {
    label: 'HTTP Request', category: 'HTTP', color: '#db2777',
    description: 'Call any public JSON API (private hosts blocked).',
    defaultConfig: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users/1', headers: {}, timeoutMs: 12000 },
    fields: [
      { key: 'method', label: 'Method', kind: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/...' },
      { key: 'headers', label: 'Headers', kind: 'keyvalue' },
      { key: 'body', label: 'Body (JSON or template)', kind: 'textarea' },
      { key: 'timeoutMs', label: 'Timeout ms (≤30000)', kind: 'number' }
    ]
  },
  webhook_response: {
    label: 'Webhook Response', category: 'HTTP', color: '#db2777',
    description: 'Answer the waiting webhook caller.',
    defaultConfig: { status: 200, body: { ok: true }, stop: true },
    fields: [
      { key: 'status', label: 'Status code', kind: 'number' },
      { key: 'body', label: 'Body (JSON)', kind: 'json' },
      { key: 'stop', label: 'Stop workflow after responding', kind: 'checkbox' }
    ]
  },
  ai_generation: {
    label: 'AI Generation', category: 'AI · Nemotron', color: '#ea580c',
    description: 'Free-form text from NVIDIA Nemotron.',
    defaultConfig: { prompt: 'Write a welcome email for {{trigger.name}}.', systemInstruction: '', temperature: 0.3, maxTokens: 512 },
    fields: [
      { key: 'prompt', label: 'Prompt', kind: 'textarea' },
      { key: 'systemInstruction', label: 'System instruction', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'maxTokens', label: 'Max output tokens', kind: 'number' }
    ]
  },
  ai_classification: {
    label: 'AI Classification', category: 'AI · Nemotron', color: '#ea580c',
    description: 'Classify text into your categories → {label, confidence, reason}.',
    defaultConfig: { input: '{{trigger.text}}', categories: ['praise', 'complaint', 'question'], systemInstruction: '', temperature: 0.1, maxTokens: 256 },
    fields: [
      { key: 'input', label: 'Input text', kind: 'textarea' },
      { key: 'categories', label: 'Categories (one per line)', kind: 'lines' },
      { key: 'systemInstruction', label: 'System instruction', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'maxTokens', label: 'Max output tokens', kind: 'number' }
    ]
  },
  ai_extraction: {
    label: 'AI Extraction', category: 'AI · Nemotron', color: '#ea580c',
    description: 'Extract structured JSON defined by your schema.',
    defaultConfig: { input: '{{trigger.text}}', schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } }, systemInstruction: '', temperature: 0.1, maxTokens: 512 },
    fields: [
      { key: 'input', label: 'Input text', kind: 'textarea' },
      { key: 'schema', label: 'JSON schema', kind: 'json' },
      { key: 'systemInstruction', label: 'System instruction', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'maxTokens', label: 'Max output tokens', kind: 'number' }
    ]
  },
  ai_summarization: {
    label: 'AI Summarization', category: 'AI · Nemotron', color: '#ea580c',
    description: 'Summarize long text with Nemotron.',
    defaultConfig: { input: '{{trigger.document}}', style: 'in three bullet points', systemInstruction: '', temperature: 0.3, maxTokens: 512 },
    fields: [
      { key: 'input', label: 'Input text', kind: 'textarea' },
      { key: 'style', label: 'Style hint', kind: 'text' },
      { key: 'systemInstruction', label: 'System instruction', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'maxTokens', label: 'Max output tokens', kind: 'number' }
    ]
  },
  ai_data_transformation: {
    label: 'AI Data Transformation', category: 'AI · Nemotron', color: '#ea580c',
    description: 'Reshape JSON via AI — returns data only, never code.',
    defaultConfig: { input: '{{trigger.data}}', instruction: 'Return the same records with keys renamed to snake_case.', systemInstruction: '', temperature: 0.1, maxTokens: 1024 },
    fields: [
      { key: 'input', label: 'Input data', kind: 'textarea' },
      { key: 'instruction', label: 'Transformation instruction', kind: 'textarea' },
      { key: 'systemInstruction', label: 'System instruction', kind: 'textarea' },
      { key: 'temperature', label: 'Temperature', kind: 'number' },
      { key: 'maxTokens', label: 'Max output tokens', kind: 'number' }
    ]
  },
  save_to_database: {
    label: 'Save to Database', category: 'Output', color: '#0d9488',
    description: 'Store a record in Supabase (workflow_records).',
    defaultConfig: { table: 'workflow_records', data: { result: '{{nodes.previous.output}}' } },
    fields: [
      { key: 'table', label: 'Table (allowlist: workflow_records)', kind: 'text' },
      { key: 'data', label: 'Record (JSON)', kind: 'json' }
    ]
  },
  csv_export: {
    label: 'CSV Export', category: 'Output', color: '#0d9488',
    description: 'Convert an array of objects to downloadable CSV.',
    defaultConfig: { input: '{{nodes.previous.output.items}}', columns: '', filename: 'export.csv' },
    fields: [
      { key: 'input', label: 'Input array', kind: 'textarea' },
      { key: 'columns', label: 'Columns (comma-separated, blank = all)', kind: 'text' },
      { key: 'filename', label: 'Filename', kind: 'text' }
    ]
  }
};

export const PALETTE = Object.entries(NODE_DEFINITIONS).map(([type, def]) => ({ type, ...def }));

export const CATEGORY_ORDER = ['Triggers', 'Data', 'HTTP', 'AI · Nemotron', 'Output'];

let counter = 0;
export function newNodeId(type) {
  counter += 1;
  const slug = type.replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '');
  return `${slug}_${Date.now().toString(36)}_${counter}`;
}
