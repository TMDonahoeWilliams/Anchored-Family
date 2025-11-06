import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/devotion/bible-in-a-year/start-plan
 *
 * Body: { userId: string, planKey?: string }
 *
 * Server-only: requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 * Uses the service role key to insert a row into bible_year_selection.
 *
 * Security note: This endpoint uses the service role key. Only call it from
 * trusted server-side code or validate/authenticate the request appropriately.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Exporting a build-time warning is fine; runtime will still check.
  console.warn('[start-plan] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing Supabase server envs (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    const planKey: string = (body?.planKey as string) ?? 'one-year-standard';

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid userId in request body' }, { status: 400 });
    }

    // Create server-side Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Insert a new selection. Adjust fields to match your table schema.
    const toInsert = {
      user_id: userId,
      plan_key: planKey,
      started_at: new Date().toISOString(),
      current_day: 1,
      progress: {}, // jsonb
    };

    const { data, error } = await supabase.from('bible_year_selection').insert([toInsert]).select().single();

    if (error) {
      // If table doesn't exist or permission error, surface helpful message
      console.error('[start-plan] Supabase insert error', error);
      return NextResponse.json({ error: 'Database insert failed', detail: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, selection: data }, { status: 201 });
  } catch (err: any) {
    console.error('[start-plan] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
