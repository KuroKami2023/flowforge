# NODE_SYSTEM

Every node: `{ id, type, config, inputMapping, outputMapping, position,
errorHandling: { onError, retryCount, retryDelayMs } }`.
Palette metadata lives in `src/lib/nodeDefinitions.js`; executors in
`api/_lib/nodeExecutors.js`.

## Triggers

| Node | Output |
|---|---|
| Manual Trigger | `{ ...workflow.input, ...trigger }` |
| Webhook Trigger | `{ body, query, headers }` from `{{trigger.body}}` |
| Schedule Trigger | `{ scheduledAt, input }` |

## Data (8)

- **Set Value** — `values` map of templates → object.
- **JSON Parser** — parses a JSON string; hard error on invalid JSON.
- **Transform Data** — predefined safe ops only: `pick, omit, rename, set,
  merge, flatten, sort_by, unique_by`. Unknown op names are rejected.
- **Filter** — keeps array rows matching `conditions` (`and/or`) with operators
  `equals, not_equals, contains, not_contains, starts_with, ends_with, gt, gte,
  lt, lte, is_empty, is_not_empty, exists`.
- **Formatter** — renders a template → `{ text }`.
- **Condition** — evaluates conditions → `{ result }`, branch `true | false`
  (dedicated canvas handles).
- **Switch** — exact-matches input against `cases[]` → branch `<caseId> |
  default` (dynamic canvas handles).
- **Loop** — maps `items` (cap 500) through `itemTemplate` (`{{loop.item}}`,
  `{{loop.index}}`) and/or safe ops → `{ items, count, total, truncated }`.

## HTTP (2)

- **HTTP Request** — `GET/POST/PUT/PATCH/DELETE` via `fetch` + abort timeout.
  SSRF guard blocks private/internal hosts (`localhost`, `127/10/192.168/
  172.16-31`, link-local, `.internal`, metadata endpoints) and non-http(s)
  schemes.
- **Webhook Response** — `{ status, body, headers }` answers the waiting caller;
  optional `stop` ends the run.

## AI (5) — see AI_NODES.md

AI Generation · AI Classification · AI Extraction · AI Summarization · AI Data
Transformation. All call Nemotron server-side; output is parsed data, never code.

## Output (2)

- **Save to Database** — inserts into the allowlisted `workflow_records` table
  (`workflow_id, user_id, node_id, execution_id, data`). Arbitrary tables rejected.
- **CSV Export** — array of objects → `{ csv, columns, rowCount, filename }`
  with RFC-4180 quoting; the UI offers one-click download.

## Variable system (`api/_lib/variables.js`)

- `{{trigger.email}}` `{{trigger.body}}` `{{nodes.x.output}}`
  `{{workflow.input.customer_id}}`, plus `[n]` indexes and deep paths.
- Full-string expressions return raw typed values; embedded ones interpolate
  (objects → JSON, missing → `''`).
- Safety: identifier-path regex + forbidden segments (`__proto__`,
  `constructor`, `prototype`) + `hasOwnProperty` traversal. No `eval`, no
  `Function`, no method calls — user/AI text can never become code.
