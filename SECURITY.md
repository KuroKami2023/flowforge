# SECURITY

## Authentication & authorization

- Supabase Auth (email/password) on the frontend; every API call carries the
  user's JWT (`apiFetch` attaches it automatically).
- Routes resolve the user server-side (`auth.getUser`) — client claims are
  never trusted.
- Ownership checks on every read/write (`eq('user_id', user.id)`); foreign ids
  return 404 (no existence oracle).
- RLS owner-only policies on all 9 tables (see DATABASE.md).

## Secrets

- `NVIDIA_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` live only in server env
  (Vercel dashboard). The frontend bundle contains neither — grep-safe:
  only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are exposed.
- Webhook secrets: random 32-byte hex, compared with `timingSafeEqual`,
  rotatable from the builder. Cron protected by `CRON_SECRET`.

## No arbitrary code execution

- Variable system is pure path lookup (regex + forbidden-segment blocklist +
  `hasOwnProperty` traversal). No `eval` / `Function` anywhere in the codebase.
- AI output is parsed data only (`safeParseJson`), never executed; transforms
  use predefined ops; model drift outside classification allowlists is blanked.
- `Save to Database` writes to an allowlisted table only.

## Input & abuse controls

- Workflow validation (types, ids, refs, cycles, per-type config, 50-node /
  100-connection caps) before save and before every run.
- Per-IP rate limits (conservative on execute/AI-test/webhook routes), payload
  caps (256 KB webhooks, prompt/token clamps), request timeouts (15 s HTTP,
  60 s AI, 55 s execution budget).
- HTTP node SSRF guard: public hosts only — private ranges, localhost, cloud
  metadata endpoints and non-http(s) schemes are rejected.
- Row counts/iterations capped (loop ≤ 500, schedules ≤ 10 runs/tick).

## Reporting issues

Please report vulnerabilities privately to the repository owner; do not open
public issues with exploit details.
