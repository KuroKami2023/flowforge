/** Extract the Supabase user from an incoming request's bearer token. */
import { getUserClient } from './supabaseAdmin.js';

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function getUserFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) return { user: null, token: null };
  const client = getUserClient(token);
  if (!client) return { user: null, token: null };
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return { user: null, token: null };
    return { user: data.user, token };
  } catch {
    return { user: null, token: null };
  }
}

export function requireMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.status(405).json({ error: `Method ${req.method} not allowed. Use ${methods.join(', ')}.` });
    return false;
  }
  return true;
}

export function send(res, status, data) {
  return res.status(status).json(data);
}

export function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}
