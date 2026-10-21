import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ylmjqunzvhwzgyvlgauu.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsbWpxdW56dmh3emd5dmxnYXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzQ0NDEsImV4cCI6MjEwODA1MDQ0MX0.sJH5RgHZBFyNlYS9ZRtILQd5lbDKe4duyu7N6yekzw0';

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsbWpxdW56dmh3emd5dmxnYXV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQ3NDQ0MSwiZXhwIjoyMTA4MDUwNDQxfQ.Re6PT3jazLwKsBFCww7VuBR1iE1ZXFVaTdnqAi6oa1A';

// Public browser client (uses Anon Key)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Admin service-role client (for backend route handlers & background workers)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
