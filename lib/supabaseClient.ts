// Public/browser Supabase client (uses anon key)
// Safe to use in Client Components.
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,      // same URL as above
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // anon public key
);
