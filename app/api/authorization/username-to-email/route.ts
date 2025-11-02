/**
 * Server route to map a username to the current email on record.
 * - Expects POST { username: string }
 * - Returns { email } on success (200)
 * - Returns 404 if not found
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY server key to read the users/profile table.
 *
 * IMPORTANT:
 * - Ensure SUPABASE_SERVICE_ROLE_KEY is set in Vercel environment variables.
 * - Adjust the query if your username column/table differs (e.g. 'profiles' or 'users' table).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[api/auth/username-to-email] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const supabaseAdmin = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const username = body?.username?.toString?.().trim?.();
    if (!username) {
      return jsonResponse({ error: 'username is required' }, 400);
    }

    // Adjust table/column names to your schema:
    // Common patterns:
    // - public.profiles or public.users table with column "username" and "email"
    // - If you store username in a different table, update the .from(...) below.
    const { data, error } = await supabaseAdmin
      .from('users') // change to 'profiles' if applicable
      .select('id, email, username')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[api/auth/username-to-email] supabase query error:', error);
      return jsonResponse({ error: 'Server error' }, 500);
    }

    if (!data || !data.email) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    // Return only the email — do NOT return sensitive tokens
    return jsonResponse({ email: data.email });
  } catch (err: any) {
    console.error('[api/auth/username-to-email] unexpected error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
