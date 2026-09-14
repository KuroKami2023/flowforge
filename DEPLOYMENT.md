# DEPLOYMENT

Free-only: **Vercel Hobby** (frontend + functions + cron) · **Supabase Free**
(Postgres + Auth) · **NVIDIA free endpoint**. No AWS, no paid queues/databases.

## 1. Supabase setup (5 min)

1. Create a free project at supabase.com → copy **Project URL** and **anon key**,
   plus the **service_role** key (Settings → API).
2. SQL editor → paste & run `supabase/schema.sql` (extensions, 9 tables, RLS,
   profile trigger). Verify: `select * from public.workflows;` returns empty.
3. Auth → Providers → Email enabled (default). No extra config needed.

## 2. NVIDIA key

1. build.nvidia.com → Generate Key (free tier).
2. Keep it for step 3 — it is **server-only**.

## 3. Vercel deploy

```bash
npm i -g vercel
vercel            # link / preview
vercel --prod
```

Environment variables (Vercel → Project → Settings → Environment):

| Variable | Exposed to browser? | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | yes (public) | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | yes (public) | anon key |
| `NVIDIA_API_KEY` | **no** | NVIDIA key |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | service_role key |
| `CRON_SECRET` | **no** | random string (recommended) |

`vercel.json` already configures: Node runtime for `api/**/*.js`, SPA fallback
(`/api/*` → functions, everything else → `index.html`), and the schedule cron:

```json
{ "path": "/api/cron/check-schedules", "schedule": "*/5 * * *" }
```

If you set `CRON_SECRET`, add it to the cron via Vercel's cron settings or call
with `?secret=` — Hobby cron calls the path as-is, so prefer the dashboard's
cron secret wiring; the route still enforces ownership per schedule.

## 4. Verify production

1. Sign up in the app (creates `profiles` row via trigger).
2. Dashboard → **Load demo: JSON Data Transformer** → open → **Run** → success.
3. Dashboard → **Test Nemotron** → expect model text (proves server key works).
4. `GET /api/health` → `{ ok: true }`.

## Notes & limits

- Hobby functions: 60 s timeout — the engine budgets 55 s per run.
- Schedules tick at most every 5 minutes (cron granularity) — documented in-app.
- Cold starts: first AI call may take longer; node retries absorb flakes.
