/**
 * Supabase admin client (server-side only).
 * Uses the service-role key so routes can enforce ownership explicitly
 * while RLS policies remain as a second layer of defence.
 */
import { createClient } from '@supabase/supabase-js';

let cached = null;

export function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cached;
}

/** User-scoped client (RLS applies) from a bearer token. */
export function getUserClient(token) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
}
