import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Defensive start-plan route:
 * - Uses SUPABASE_SERVICE_ROLE_KEY to insert into bible_year_selection.
 * - If the insert fails due to missing columns (day_index, household_id, reminder_time, start_date, translation),
 *   retries with those fields removed or remapped (day_index -> current_day; started_at -> start_date mapping handled if needed).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[start-plan] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
}

function isMissingColumnError(msg: string | undefined, colNames: string[]) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  // Postgres / Supabase error messages vary; check for common patterns
  return colNames.some((c) =>
    lower.includes(`column "${c.toLowerCase()}" does not exist`) ||
    lower.includes(`could not find the '${c.toLowerCase()}' column`) ||
    lower.includes(`relation "public.${c.toLowerCase()}" does not exist`)
  );
}

/** Attempt insert, retrying if specific columns are missing */
async function resilientInsert(supabase: any, table: string, row: any) {
  const tryInsert = async (r: any) => {
    return await supabase.from(table).insert([r]).select().single();
  };

  let attemptRow = { ...row };

  // First attempt
  let result = await tryInsert(attemptRow);
  if (!result.error) return result;

  const msg = String(result.error?.message ?? result.error?.details ?? result.error ?? '');
  // If missing any of these optional columns, remove or remap and retry
  if (isMissingColumnError(msg, ['day_index', 'household_id', 'reminder_time', 'start_date', 'translation'])) {
    // remap day_index -> current_day if present
    if ('day_index' in attemptRow) {
      attemptRow.current_day = attemptRow.day_index;
      delete attemptRow.day_index;
    }
    // If start_date missing but started_at present, map started_at -> start_date (date part)
    if ('started_at' in attemptRow && !('start_date' in attemptRow)) {
      try {
        const d = new Date(attemptRow.started_at);
        if (!isNaN(d.getTime())) {
          attemptRow.start_date = d.toISOString().slice(0, 10); // YYYY-MM-DD
        }
      } catch {
        // ignore parse errors
      }
    }
    // remove household_id if present
    if ('household_id' in attemptRow) {
      delete attemptRow.household_id;
    }
    // remove reminder_time if present
    if ('reminder_time' in attemptRow) {
      delete attemptRow.reminder_time;
    }
    // remove translation if present
    if ('translation' in attemptRow) {
      delete attemptRow.translation;
    }
    // if start_date still present and missing column caused error, remove it
    if ('start_date' in attemptRow) {
      delete attemptRow.start_date;
    }

    result = await tryInsert(attemptRow);
    return result;
  }

  // Other errors: return original result so caller can handle
  return result;
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing Supabase server envs (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    const planKey: string = (body?.planKey as string) ?? 'one-year-standard';
    const householdId: string | undefined = body?.householdId; // optional
    const reminderTime: string | undefined = body?.reminderTime; // optional, expected like '08:00:00' or ISO time
    // optional explicit start_date (YYYY-MM-DD) – if client provides one
    const startDate: string | undefined = body?.startDate;
    const translation: string | undefined = body?.translation; // e.g., "NIV", "KJV"

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid userId in request body' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const toInsert: any = {
      user_id: userId,
      plan_key: planKey,
      started_at: new Date().toISOString(),
      // prefer day_index if your app uses it; resilientInsert will remap if not present
      day_index: 1,
      progress: {}, // jsonb
    };

    // include optional fields if provided
    if (householdId) toInsert.household_id = householdId;
    if (reminderTime) toInsert.reminder_time = reminderTime;
    if (translation) toInsert.translation = translation;
    // include start_date as YYYY-MM-DD if provided or default
    if (startDate) {
      toInsert.start_date = startDate;
    } else {
      toInsert.start_date = new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await resilientInsert(supabase, 'bible_year_selection', toInsert);

    if (error) {
      console.error('[start-plan] insert error', error);
      return NextResponse.json({ error: 'Database insert failed', detail: String(error.message ?? error) }, { status: 502 });
    }

    return NextResponse.json({ ok: true, selection: data }, { status: 201 });
  } catch (err: any) {
    console.error('[start-plan] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
