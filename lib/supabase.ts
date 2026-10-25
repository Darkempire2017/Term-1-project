import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client. Keys come from environment variables only —
// never commit them. The browser never talks to Supabase directly; every read
// and write goes through the API routes, so the anon key is not needed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    '❌ [Supabase] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Database requests will fail until they are.'
  );
}

// Admin service-role client (for backend route handlers & background workers)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl || 'http://supabase-url-not-configured.invalid',
  supabaseServiceRoleKey || 'service-role-key-not-configured',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
