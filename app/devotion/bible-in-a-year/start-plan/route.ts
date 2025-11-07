import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Start-plan route (no ON CONFLICT)
 * - Uses SUPABASE_SERVICE_ROLE_KEY (server-only) to read then insert or update.
 * - This avoids Postgres ON CONFLICT errors when the unique index doesn't exist.
 * - NOTE: This approach has a race condition possibility if two requests start the same plan exactly concurrently.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
    const householdId: string | undefined = body?.householdId;
    const reminderTime: string | undefined = body?.reminderTime;
    const startDate: string | undefined = body?.startDate;
    const translation: string | undefined = body?.translation;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid userId in request body' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const toUpsert: any = {
      user_id: userId,
      plan_key: planKey,
      started_at: new Date().toISOString(),
      day_index: 1,
      current_day: 1,
      progress: {},
      start_date: startDate ?? new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (householdId) toUpsert.household_id = householdId;
    if (reminderTime) toUpsert.reminder_time = reminderTime;
    if (translation) toUpsert.translation = translation;

    // 1) Try to find an existing selection for (user_id, plan_key)
    const { data: existing, error: selectError } = await supabase
      .from('bible_year_selection')
      .select('*')
      .match({ user_id: userId, plan_key: planKey })
      .maybeSingle();

    if (selectError) {
      console.error('[start-plan] select error', selectError);
      return NextResponse.json({ error: 'Database select failed', detail: String(selectError.message ?? selectError) }, { status: 502 });
    }

    if (existing) {
      // 2) Update existing row
      const { data: updated, error: updateErr } = await supabase
        .from('bible_year_selection')
        .update({
          // update relevant fields; preserve existing.where appropriate
          started_at: toUpsert.started_at,
          start_date: toUpsert.start_date,
          day_index: toUpsert.day_index,
          current_day: toUpsert.current_day,
          progress: toUpsert.progress,
          reminder_time: toUpsert.reminder_time ?? existing.reminder_time,
          translation: toUpsert.translation ?? existing.translation,
          household_id: toUpsert.household_id ?? existing.household_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        console.error('[start-plan] update error', updateErr);
        return NextResponse.json({ error: 'Database update failed', detail: String(updateErr.message ?? updateErr) }, { status: 502 });
      }
      return NextResponse.json({ ok: true, selection: updated }, { status: 200 });
    } else {
      // 3) Insert new row
      const { data: inserted, error: insertErr } = await supabase
        .from('bible_year_selection')
        .insert([toUpsert])
        .select()
        .single();

      if (insertErr) {
        console.error('[start-plan] insert error', insertErr);
        return NextResponse.json({ error: 'Database insert failed', detail: String(insertErr.message ?? insertErr) }, { status: 502 });
      }
      return NextResponse.json({ ok: true, selection: inserted }, { status: 201 });
    }
  } catch (err: any) {
    console.error('[start-plan] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
