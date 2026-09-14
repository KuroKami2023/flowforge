# ARCHITECTURE

```
┌──────────────────────┐      JWT (Supabase Auth)      ┌───────────────────┐
│  React Workflow      │ ───────────────────────────▶  │  Vercel API       │
│  Editor (React Flow) │                               │  /api/**/*.js     │
│  Dashboard · History │ ◀───────────────────────────  │  ownership checks │
└──────────────────────┘      JSON results             │  rate limiting    │
                                                       └────────┬──────────┘
                                                                │
                                                     ┌──────────▼──────────┐
                                                     │ Workflow Execution  │
                                                     │ Engine (api/_lib)   │
                                                     │ validate → order →  │
                                                     │ run → persist       │
                                                     └──────────┬──────────┘
                                                                │
                                    ┌───────────────────────────┼───────────────────────────┐
                                    │                           │                           │
                             ┌──────▼──────┐            ┌───────▼────────┐           ┌──────▼───────┐
                             │  Supabase   │            │ NVIDIA Nemotron│           │ Public HTTP  │
                             │  PostgreSQL │            │ 3 Nano Omni    │           │ APIs (HTTP   │
                             │  + Auth/RLS │            │ (AI nodes only,│           │ node, SSRF-  │
                             └─────────────┘            │ server-side)   │           │ guarded)     │
                                                        └────────────────┘           └──────────────┘
```

## Layers

- **Frontend (`src/`)** — React 18 + Vite + Tailwind + React Flow + React Router.
  No secrets here: only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. All data
  access goes through same-origin `/api/*` with the Supabase JWT attached.
- **API (`api/`)** — Vercel Node serverless functions (plain JavaScript ESM).
  Every route authenticates via Supabase (`getUserFromRequest`), checks ownership
  (`user_id`), validates input and is rate-limited.
- **Engine (`api/_lib/`)** — pure, testable modules:
  `variables.js` (safe `{{…}}` resolution), `validator.js`, `nodeExecutors.js`
  (20 real executors), `executionEngine.js` (traversal, retries, budgets),
  `persist.js` (execution + graph mirroring).
- **AI (`api/services/nvidiaAI.js`)** — the only place `NVIDIA_API_KEY` is read.
  Chat-completions client plus `classify / extract / summarize / generate`
  helpers with safe JSON parsing.
- **Database** — Supabase PostgreSQL; canonical graph lives in
  `workflows.definition`, mirrored to `workflow_nodes` / `workflow_connections`
  for querying. Runs recorded in `workflow_executions` +
  `workflow_execution_nodes`.

## Request flows

- **Manual run:** Builder → `POST /api/workflows/[id]?action=execute` → engine runs with
  `triggerData = workflowInput = body.input` → node rows persisted incrementally
  → final result (status, output, errors, per-node results).
- **Webhook:** `POST /api/webhooks/[workflowId]` (optional `X-Webhook-Secret`) →
  same engine path with `triggerData = { body, query, headers }`. A terminal
  `webhook_response` node controls the HTTP response.
- **Schedule:** Vercel cron → `GET /api/cron/check-schedules` (every 5 min) →
  runs each due `workflow_schedules` row, advances `next_run_at`.
- **Retry:** `POST /api/executions/[id]?action=retry` re-runs from the first failed node,
  reusing prior successful outputs as context.
