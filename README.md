# FlowForge AI

A SaaS-style **visual workflow automation platform** with **NVIDIA Nemotron AI nodes** built in.
Design flows on a React Flow canvas, run them on serverless functions, inspect every step.

**Stack (free-first, JavaScript only):** React + Vite + Tailwind + React Flow ·
Vercel serverless functions · Supabase PostgreSQL + Auth · NVIDIA Nemotron 3 Nano
Omni 30B A3B Reasoning (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`).

## What you can do

- **Build** workflows from 20 real node types (triggers, data ops, HTTP, AI, outputs)
- **Run** them with a JSON trigger payload and watch per-node results
- **Inspect** execution history, debug outputs, durations and errors
- **Retry** failed executions from the exact node that failed
- **Trigger** flows from the outside via webhooks (`POST /api/webhooks/{workflowId}`)
- **Schedule** flows on an interval with zero paid queue (Vercel cron + polling)
- **Classify, extract, summarize and transform** with Nemotron — structured JSON out

## Quick start

```bash
npm install
cp .env.example .env        # fill in values (see below)
npm run dev                 # http://localhost:5173
npm test                    # 31 engine tests, no network needed
```

### 1. Supabase (free)

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor (tables + RLS + profile trigger).
3. Optionally run `supabase/seed.sql` after replacing `:USER_ID` — or just use the
   dashboard's **Load demo** buttons (same content, correct owner automatically).
4. Set in `.env` / Vercel:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)

### 2. NVIDIA (free endpoint, server only)

1. Get a key at build.nvidia.com.
2. Set `NVIDIA_API_KEY` in Vercel (never `VITE_`-prefixed, never in the browser).
3. Test it from the dashboard's **Test Nemotron** box (`POST /api/ai/test`).

### 3. Deploy (Vercel Hobby)

```bash
vercel --prod
```

Set the env vars above in the Vercel dashboard. `vercel.json` already wires the
API routes, the SPA fallback and the 5-minute schedule cron. See DEPLOYMENT.md.

## Demos (all genuinely execute)

| Demo | Nodes | Needs |
|---|---|---|
| Feedback Classifier | manual → AI classification → formatter → DB | NVIDIA key |
| Lead Enrichment | manual → set → HTTP (public API) → transform → DB | internet |
| Invoice Classifier | manual → AI classification → condition → formatters → DB | NVIDIA key |
| Document Summarizer | manual → AI summarization → formatter → DB | NVIDIA key |
| JSON Data Transformer | manual → parse → filter → sort → CSV | nothing |

## Docs

ARCHITECTURE · WORKFLOW_ENGINE · NODE_SYSTEM · AI_NODES · API · DATABASE ·
SECURITY · DEPLOYMENT · DEVELOPMENT.

## Portfolio highlights

Workflow orchestration · visual programming · AI agents/workflows · API
integration · serverless architecture · error handling & retries · structured AI
output · automation engineering · full-stack JavaScript.
