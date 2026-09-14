/**
 * Best-effort in-memory rate limiter for serverless functions.
 * (Per-instance memory; Supabase-backed counting would survive cold starts,
 * but this keeps the free tier dependency-free while still blunting abuse.)
 */
const buckets = new Map();

function getMax() {
  const v = Number(process.env.RATE_LIMIT_MAX);
  return Number.isFinite(v) && v > 0 ? v : 60;
}
function getWindow() {
  const v = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(v) && v > 0 ? v : 60000;
}

export function checkRateLimit(key, { max = getMax(), windowMs = getWindow() } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    resetMs: bucket.resetAt - now
  };
}

export function rateLimitMiddleware(req, res, routeName, opts) {
  const ip =
    req.headers?.['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const result = checkRateLimit(`${routeName}:${ip}`, opts);
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down and try again.' });
    return false;
  }
  return true;
}
