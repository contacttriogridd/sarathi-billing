import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True once real Supabase credentials are present in the environment. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && /^https?:\/\//.test(supabaseUrl) && !supabaseUrl.includes('your-project'),
);

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'sarathi-billing-auth' },
    })
  : (null as unknown as SupabaseClient);
