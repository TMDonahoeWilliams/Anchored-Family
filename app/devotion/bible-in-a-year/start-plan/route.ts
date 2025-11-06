import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Defensive start-plan route:
 * - Uses SUPABASE_SERVICE_ROLE_KEY to insert into bible_year_selection.
 * - If the insert fails due to missing columns (day_index, household_id), retries with those fields removed
 *   or remapped (day_index -> current_day).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[start-plan] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
}

function isMissingColumnError(msg: string | undefined, colNames: string[]) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return colNames.some((c) => lower.includes(`column "${c.toLowerCase()}" does not exist`) || lower.includes(`could not find the '${c.toLowerCase()}' column`));
}

/** Attempt insert, retrying if specific columns are missing */
async function resilientInsert(supabase: any, table: string, row: any) {
  // Try inserting as-provided first
  const tryInsert = async (r: any) => {
    const res = await supabase.from(table).insert([r]).select().single();
    return res;
  };

  let attemptRow = { ...row };

  // Try first time
  let result = await tryInsert(attemptRow);
  if (!result.error) return result;

  const msg = String(result.error?.message ?? result.error?.details ?? '');
  // If missing day_index or household_id, remove or remap and retry
  if (isMissingColumnError(msg, ['day_index', 'household_id'])) {
    // If day_index exists, map to current_day and remove day_index
    if ('day_index' in attemptRow) {
      attemptRow.current_day = attemptRow.day_index;
      delete attemptRow.day_index;
    }
    // Remove household_id if present
    if ('household_id' in attemptRow) {
      delete attemptRow.household_id;
    }

    result = await tryInsert(attemptRow);
    return result;
  }

  // Other errors: return the original result (caller will handle)
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
    // only include household_id if provided
    if (householdId) toInsert.household_id = householdId;

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
