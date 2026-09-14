/**
 * Demo workflow templates — one-click creation from the dashboard.
 * Every demo genuinely executes on the backend engine:
 *  - JSON Data Transformer runs fully offline (no AI, no network).
 *  - Lead Enrichment uses a free public JSON API (no key required).
 *  - The three AI demos use NVIDIA Nemotron (server-side key required).
 */

function node(id, type, config = {}, position = { x: 0, y: 0 }, extra = {}) {
  return {
    id,
    type,
    config,
    inputMapping: {},
    outputMapping: {},
    position,
    errorHandling: { onError: 'stop', retryCount: 1, retryDelayMs: 500 },
    ...extra
  };
}

function conn(from, to, sourceHandle = null) {
  return sourceHandle ? { from, to, sourceHandle } : { from, to };
}

export const DEMO_WORKFLOWS = [
  {
    key: 'feedback-classifier',
    name: 'Feedback Classifier',
    description: 'Classify customer feedback with Nemotron, format the verdict and store it.',
    needsAi: true,
    definition: {
      nodes: [
        node('trigger', 'manual_trigger', {}, { x: 80, y: 120 }),
        node('classify', 'ai_classification', {
          input: '{{trigger.feedback}}',
          categories: ['praise', 'complaint', 'question', 'spam'],
          systemInstruction: 'You classify customer feedback. Respond with JSON only.',
          temperature: 0.1,
          maxTokens: 256
        }, { x: 340, y: 120 }),
        node('format', 'formatter', {
          template: 'Feedback from {{trigger.name}} classified as "{{nodes.classify.output.label}}" (confidence {{nodes.classify.output.confidence}}). Reason: {{nodes.classify.output.reason}}'
        }, { x: 600, y: 120 }),
        node('store', 'save_to_database', { table: 'workflow_records', data: { name: '{{trigger.name}}', label: '{{nodes.classify.output.label}}', summary: '{{nodes.format.output.text}}' } }, { x: 860, y: 120 })
      ],
      connections: [conn('trigger', 'classify'), conn('classify', 'format'), conn('format', 'store')]
    },
    sampleInput: { name: 'Ada Lovelace', feedback: 'The new dashboard is fantastic — setup took two minutes!' }
  },
  {
    key: 'lead-enrichment',
    name: 'Lead Enrichment',
    description: 'Normalize a lead, enrich it from a free public API, then store the result.',
    needsAi: false,
    definition: {
      nodes: [
        node('trigger', 'manual_trigger', {}, { x: 80, y: 120 }),
        node('normalize', 'set_value', {
          values: { name: '{{trigger.name}}', email: '{{trigger.email}}', company: '{{trigger.company}}' }
        }, { x: 340, y: 120 }),
        node('enrich', 'http_request', {
          method: 'GET',
          url: 'https://jsonplaceholder.typicode.com/users/1',
          timeoutMs: 12000
        }, { x: 600, y: 120 }),
        node('pick', 'transform_data', {
          input: '{{nodes.enrich.output.data}}',
          operations: [{ op: 'pick', fields: ['name', 'email', 'company', 'website'] }]
        }, { x: 860, y: 120 }),
        node('merge', 'transform_data', {
          input: '{{nodes.normalize.output}}',
          operations: [{ op: 'merge', value: {} }]
        }, { x: 860, y: 320 }),
        node('store', 'save_to_database', {
          table: 'workflow_records',
          data: { lead: '{{nodes.normalize.output}}', enrichment: '{{nodes.pick.output}}' }
        }, { x: 1120, y: 200 })
      ],
      connections: [
        conn('trigger', 'normalize'),
        conn('normalize', 'enrich'),
        conn('enrich', 'pick'),
        conn('pick', 'merge'),
        conn('merge', 'store')
      ]
    },
    sampleInput: { name: 'Grace Hopper', email: 'grace@example.com', company: 'Example Inc' }
  },
  {
    key: 'invoice-classifier',
    name: 'Invoice Classifier',
    description: 'Classify invoice text with Nemotron and branch on whether it is paid.',
    needsAi: true,
    definition: {
      nodes: [
        node('trigger', 'manual_trigger', {}, { x: 60, y: 200 }),
        node('classify_invoice', 'ai_classification', {
          input: '{{trigger.invoice_text}}',
          categories: ['paid', 'pending', 'overdue', 'invalid'],
          systemInstruction: 'You classify invoice status. Respond with JSON only.',
          temperature: 0.1,
          maxTokens: 256
        }, { x: 320, y: 200 }),
        node('is_paid', 'condition', {
          logic: 'and',
          conditions: [{ left: '{{nodes.classify_invoice.output.label}}', operator: 'equals', right: 'paid' }]
        }, { x: 580, y: 200 }),
        node('paid_msg', 'formatter', { template: 'Invoice {{trigger.invoice_id}} is PAID. No action needed.' }, { x: 840, y: 80 }),
        node('review_msg', 'formatter', { template: 'Invoice {{trigger.invoice_id}} needs review (status: {{nodes.classify_invoice.output.label}}).' }, { x: 840, y: 320 }),
        node('store', 'save_to_database', {
          table: 'workflow_records',
          data: { invoice_id: '{{trigger.invoice_id}}', status: '{{nodes.classify_invoice.output.label}}' }
        }, { x: 1100, y: 200 })
      ],
      connections: [
        conn('trigger', 'classify_invoice'),
        conn('classify_invoice', 'is_paid'),
        conn('is_paid', 'paid_msg', 'true'),
        conn('is_paid', 'review_msg', 'false'),
        conn('paid_msg', 'store'),
        conn('review_msg', 'store')
      ]
    },
    sampleInput: { invoice_id: 'INV-2041', invoice_text: 'Invoice INV-2041 for $1,200. Payment received on Sept 2. Thank you!' }
  },
  {
    key: 'document-summarizer',
    name: 'Document Summarizer',
    description: 'Summarize long pasted text with Nemotron and store the summary.',
    needsAi: true,
    definition: {
      nodes: [
        node('trigger', 'manual_trigger', {}, { x: 80, y: 120 }),
        node('summarize', 'ai_summarization', {
          input: '{{trigger.document}}',
          style: 'in three bullet points',
          temperature: 0.3,
          maxTokens: 512
        }, { x: 340, y: 120 }),
        node('format', 'formatter', { template: 'Summary of "{{trigger.title}}":\n{{nodes.summarize.output.summary}}' }, { x: 600, y: 120 }),
        node('store', 'save_to_database', {
          table: 'workflow_records',
          data: { title: '{{trigger.title}}', summary: '{{nodes.format.output.text}}' }
        }, { x: 860, y: 120 })
      ],
      connections: [conn('trigger', 'summarize'), conn('summarize', 'format'), conn('format', 'store')]
    },
    sampleInput: {
      title: 'Quarterly update',
      document: 'Acme Corp grew revenue 18% quarter over quarter. Churn fell from 4.1% to 2.8% after the onboarding revamp. The team shipped fourteen features, including SSO and audit logs. Hiring continues in support and sales.'
    }
  },
  {
    key: 'json-transformer',
    name: 'JSON Data Transformer',
    description: 'Parse raw JSON, filter rows, reshape fields and export CSV — no AI needed.',
    needsAi: false,
    definition: {
      nodes: [
        node('trigger', 'manual_trigger', {}, { x: 60, y: 160 }),
        node('parse', 'json_parser', { input: '{{trigger.raw_json}}' }, { x: 300, y: 160 }),
        node('adults', 'filter', {
          input: '{{nodes.parse.output.users}}',
          logic: 'and',
          conditions: [{ field: 'age', operator: 'gte', value: 18 }]
        }, { x: 540, y: 160 }),
        node('reshape', 'transform_data', {
          input: '{{nodes.adults.output.items}}',
          operations: [{ op: 'sort_by', field: 'age', direction: 'asc' }]
        }, { x: 780, y: 160 }),
        node('export', 'csv_export', { input: '{{nodes.reshape.output}}', filename: 'adults.csv' }, { x: 1020, y: 160 })
      ],
      connections: [
        conn('trigger', 'parse'),
        conn('parse', 'adults'),
        conn('adults', 'reshape'),
        conn('reshape', 'export')
      ]
    },
    sampleInput: {
      raw_json: JSON.stringify({
        users: [
          { name: 'Amy', age: 34, city: 'Lagos' },
          { name: 'Ben', age: 15, city: 'Accra' },
          { name: 'Cid', age: 29, city: 'Nairobi' }
        ]
      })
    }
  }
];
