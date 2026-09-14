# API

Base: same origin. Authenticated routes need `Authorization: Bearer <supabase JWT>`.
All authenticated routes are per-IP rate-limited (`X-RateLimit-Remaining`).

| Method & path | Auth | Description |
|---|---|---|
| `GET /api/health` | no | Liveness + model name |
| `GET /api/workflows` | yes | List own workflows (id, name, description, enabled, timestamps) |
| `POST /api/workflows` | yes | Create (`name, description?, definition?, enabled?`); validates non-empty graphs |
| `GET /api/workflows/[id]` | yes | Full workflow incl. definition (owner only) |
| `PUT /api/workflows/[id]` | yes | Update meta/definition; mirrors graph tables |
| `DELETE /api/workflows/[id]` | yes | Delete (executions cascade) |
| `POST /api/workflows/[id]/duplicate` | yes | Copy (disabled by default) |
| `POST /api/workflows/[id]/execute` | yes | Run with `{ input }` → `{ executionId, status, output, errors, durationMs, nodeResults }` (20 req/min) |
| `GET /api/workflows/[id]/webhook` | yes | Webhook info (creates endpoint on first read) |
| `POST /api/workflows/[id]/webhook` | yes | Rotate webhook secret |
| `GET /api/workflows/[id]/schedule` | yes | Current schedule or null |
| `PUT /api/workflows/[id]/schedule` | yes | Set `{ everyMinutes: 5–1440, enabled }` |
| `DELETE /api/workflows/[id]/schedule` | yes | Remove schedule |
| `GET /api/executions?workflowId?&status?` | yes | List own executions (max 100), with workflow names |
| `GET /api/executions/[id]` | yes | Execution + node rows + workflow name |
| `POST /api/executions/[id]/retry` | yes | Re-run failed execution from first failed node |
| `POST /api/webhooks/[workflowId]` | secret* | Public ingress; `X-Webhook-Secret` header if a secret is set; 256 KB cap |
| `GET /api/cron/check-schedules` | secret** | Run due schedules (Vercel cron, ≤10 per tick) |
| `POST /api/ai/test` | yes | Nemotron smoke test (10 req/min) |
| `GET /api/dashboard/stats` | yes | Totals, active, success/fail, avg ms + recent 10 |

\* 401 on wrong secret, 404 when the workflow is missing/disabled.
\** `CRON_SECRET` via `?secret=` or bearer; open only if unset (set it in prod).

## Error shape

```json
{ "error": "message", "details": ["validation errors…"] }
```

Execute maps a terminal `webhook_response` node's status code onto the HTTP
response; otherwise 200 with the run envelope.
