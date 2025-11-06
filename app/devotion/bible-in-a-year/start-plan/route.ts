import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[start-plan] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
}

function isMissingConstraintError(msg?: string) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('no unique or exclusion constraint matching') ||
    lower.includes('does not have a unique constraint') ||
    lower.includes('no unique constraint matches the given keys')
  );
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
      progress: {},
      start_date: startDate ?? new Date().toISOString().slice(0, 10),
    };
    if (householdId) toUpsert.household_id = householdId;
    if (reminderTime) toUpsert.reminder_time = reminderTime;
    if (translation) toUpsert.translation = translation;

    // Try upsert first (preferred). onConflict will only work if the DB has a unique constraint on the given columns.
    try {
      const upsertResult = await supabase
        .from('bible_year_selection')
        .upsert([toUpsert], { onConflict: 'user_id,plan_key' }) // requires unique index on (user_id, plan_key)
        .select()
        .single();

      if (upsertResult.error) {
        // If the error is the "no unique or exclusion constraint matching ..." error, we'll handle below
        if (!isMissingConstraintError(String(upsertResult.error.message ?? upsertResult.error))) {
          console.error('[start-plan] upsert error', upsertResult.error);
          return NextResponse.json({ error: 'Database upsert failed', detail: String(upsertResult.error.message ?? upsertResult.error) }, { status: 502 });
        }
        // else fallthrough to fallback flow
      } else {
        return NextResponse.json({ ok: true, selection: upsertResult.data }, { status: 201 });
      }
    } catch (err: any) {
      // supabase-js may throw too; check message and fall through if it's the missing-constraint type
      if (!isMissingConstraintError(String(err?.message ?? err))) {
        console.error('[start-plan] unexpected upsert throw', err);
        return NextResponse.json({ error: 'Unexpected DB error', detail: String(err?.message ?? err) }, { status: 500 });
      }
      // else fall through to fallback
    }

    // Fallback: read-then-insert/update (no ON CONFLICT). Slight race condition possible.
    const { data: existing, error: selectError } = await supabase
      .from('bible_year_selection')
      .select('*')
      .match({ user_id: userId, plan_key: planKey })
      .maybeSingle();

    if (selectError) {
      console.error('[start-plan] select error during fallback', selectError);
      return NextResponse.json({ error: 'Database select failed', detail: String(selectError.message ?? selectError) }, { status: 502 });
    }

    if (existing) {
      // update existing
      const { data: updated, error: updateErr } = await supabase
        .from('bible_year_selection')
        .update({
          // fields to update
          started_at: toUpsert.started_at,
          start_date: toUpsert.start_date,
          day_index: toUpsert.day_index,
          progress: toUpsert.progress,
          reminder_time: toUpsert.reminder_time ?? existing.reminder_time,
          translation: toUpsert.translation ?? existing.translation,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        console.error('[start-plan] update error during fallback', updateErr);
        return NextResponse.json({ error: 'Database update failed', detail: String(updateErr.message ?? updateErr) }, { status: 502 });
      }
      return NextResponse.json({ ok: true, selection: updated }, { status: 200 });
    } else {
      // insert new
      const { data: inserted, error: insertErr } = await supabase
        .from('bible_year_selection')
        .insert([toUpsert])
        .select()
        .single();

      if (insertErr) {
        console.error('[start-plan] insert error during fallback', insertErr);
        return NextResponse.json({ error: 'Database insert failed', detail: String(insertErr.message ?? insertErr) }, { status: 502 });
      }
      return NextResponse.json({ ok: true, selection: inserted }, { status: 201 });
    }
  } catch (err: any) {
    console.error('[start-plan] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
