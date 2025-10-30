// Server-only Supabase client (uses SERVICE_ROLE_KEY)
// ⚠️ Never import this into client-side code.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,      // e.g. https://xxxx.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY!      // from Supabase → Settings → API (Service role)
);

// Server-side client function for regular operations (not admin)
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server-side authentication helper
export async function getServerAuth() {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser();
    return { user, error };
  } catch (error) {
    return { user: null, error };
  }
}
