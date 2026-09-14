import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('FlowForge: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Auth and direct DB reads will fail until configured.');
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder');

