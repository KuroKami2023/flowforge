# DEVELOPMENT

JavaScript only: `.js` / `.jsx`. No TypeScript, no `tsconfig.json` — the build
(`vite build`) and tests (`node --test`) both enforce this implicitly.

## Commands

```bash
npm install
npm run dev            # Vite @ http://localhost:5173 (API routes need `vercel dev`)
npm test               # node --test tests/ (31 tests, offline)
npm run test:verbose
npm run build          # production bundle → dist/
npx vercel dev         # run frontend + /api functions together locally
```

Local API needs the server env in `.env` (see `.env.example`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NVIDIA_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (optional).

## Layout

```
src/            React app
  lib/          supabaseClient, api (JWT fetch wrapper), nodeDefinitions, demoWorkflows
  contexts/     AuthContext (Supabase session)
  components/   Layout, ProtectedRoute, ConfigPanel (generic field renderer)
  pages/        Auth, Dashboard, Workflows, Builder (React Flow), Executions
api/            Vercel serverless functions (ESM, req/res style)
  _lib/         variables, validator, nodeExecutors, executionEngine, persist,
                supabaseAdmin, auth, rateLimit
  services/     nvidiaAI.js (only NVIDIA_API_KEY reader)
  workflows/    CRUD + execute + duplicate + webhook info + schedule
  executions/   list + detail + retry
  webhooks/     public ingress [workflowId]
  cron/         check-schedules (free-tier scheduler)
  ai/           test (Nemotron smoke test)
  dashboard/    stats
supabase/       schema.sql (tables + RLS), seed.sql
tests/          variables, validator, engine, nvidia (stubbed fetch)
```

## Adding a node type

1. `api/_lib/validator.js` → append to `NODE_TYPES` (+ required-config checks).
2. `api/_lib/nodeExecutors.js` → write `execX` (pure, no eval) + registry entry.
3. `src/lib/nodeDefinitions.js` → label, category, color, `defaultConfig`, `fields`.
4. `tests/engine.test.js` → happy path + failure path.
5. Docs: NODE_SYSTEM.md row.

## Adding an API route

Create `api/<area>/<name>.js` exporting `default async function handler(req, res)`:
rate-limit → method check → `getUserFromRequest` → ownership filter → `send()`.

## Testing philosophy

Engine tests run fully offline (the JSON demo executes for real; NVIDIA is
stubbed at the fetch boundary). Webhook auth, retry-from-failed-node and RLS
are covered by unit-testable helpers plus the documented production checklist
in DEPLOYMENT.md §4.
