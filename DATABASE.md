# DATABASE

Supabase PostgreSQL. Full DDL in `supabase/schema.sql`; demo content in
`supabase/seed.sql` (or one-click **Load demo** in the dashboard).

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | 1:1 with `auth.users` (auto-created by trigger) | `id, email` |
| `workflows` | Owner + canonical graph | `user_id, name, description, definition{ nodes[], connections[] }, enabled` |
| `workflow_nodes` | Queryable mirror of `definition.nodes` | `workflow_id, node_id, type, config, input_mapping, output_mapping, position, error_handling` |
| `workflow_connections` | Queryable mirror of edges | `workflow_id, from_node, to_node, source_handle, label` |
| `workflow_executions` | One row per run | `workflow_id, user_id, status, trigger_type, input, output, started_at, ended_at, duration_ms, error` |
| `workflow_execution_nodes` | Per-node log per run | `execution_id, node_id, node_type, status, output, error, attempts, duration_ms` |
| `webhook_endpoints` | Ingress per workflow (1:1) | `workflow_id unique, user_id, secret, enabled` |
| `workflow_schedules` | Polling schedules (1:1) | `workflow_id unique, user_id, cron, every_minutes, enabled, last_run_at, next_run_at` |
| `workflow_records` | `Save to Database` node output | `workflow_id, user_id, node_id, execution_id?, data` |

## Conventions

- PKs are `uuid default gen_random_uuid()`; timestamps default `now()`.
- `workflows.definition` is the source of truth; the API rewrites the mirror
  tables on every save (`mirrorGraph`), so the canvas and SQL never diverge.
- Statuses are CHECK-constrained (`running|success|failed`, node
  `success|failed|skipped`).

## Row Level Security

RLS is **enabled on every table** with owner-only policies:

- Direct tables (`profiles, workflows, workflow_executions, webhook_endpoints,
  workflow_schedules, workflow_records`): `auth.uid() = user_id` (or `id`).
- Child tables (`workflow_nodes, workflow_connections` via parent workflow;
  `workflow_execution_nodes` via parent execution): `EXISTS` ownership checks.

The API additionally filters by `user_id` on the service-role client and returns
404 for foreign ids — RLS stays as the second layer, and the anon browser key
can never cross tenant boundaries.
