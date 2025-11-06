import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Airtable-backed)
 *
 * This version queries Airtable for the specific record whose Date equals today's date
 * using an Airtable server-side filter (filterByFormula). If the Date field in Airtable
 * is a proper Date type, the DATETIME_FORMAT(...,'YYYY-MM-DD') approach will match reliably.
 *
 * Env vars required:
 * - AIRTABLE_API_KEY
 * - AIRTABLE_BASE_ID
 * Optional:
 * - AIRTABLE_TABLE (defaults to 'Sheet4')
 * - AIRTABLE_VIEW (optional view name to scope the query)
 * - AIRTABLE_REVALIDATE_SECONDS (default 60)
 *
 * Query param:
 * - version=KJV|NKJV|NIV (optional). If provided, the API will prefer that column.
 *
 * Behavior:
 * - Try a filtered Airtable request for today's date (server-side).
 * - If that returns no matching record (or Date is a text field), fall back to fetching a page
 *   of records and searching client-side (older fallback behavior).
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Sheet4';
const AIRTABLE_VIEW = process.env.AIRTABLE_VIEW || ''; // optional
const REVALIDATE_SECONDS = Number(process.env.AIRTABLE_REVALIDATE_SECONDS ?? process.env.SHEET_REVALIDATE_SECONDS ?? '60');

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Safe fetch wrapper that throws with readable message */
async function safeFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Airtable API error ${res.status}: ${txt}`);
  }
  return res;
}

/** Try to fetch records filtered by today's date using Airtable formula on a Date field */
async function fetchRecordByDateFilter(baseId: string, table: string, apiKey: string, dateIso: string) {
  // Use DATETIME_FORMAT({Date},'YYYY-MM-DD') = '2025-11-06' to match date part only.
  // This requires the Date column to be an Airtable Date type. If Date is text, this may not match.
  const formula = `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${dateIso}'`;
  const params = new URLSearchParams();
  params.set('pageSize', '1');
  params.set('filterByFormula', formula);
  if (AIRTABLE_VIEW) params.set('view', AIRTABLE_VIEW);

  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;

  const res = await safeFetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: REVALIDATE_SECONDS },
  });

  const payload = await res.json();
  return (payload.records ?? []) as any[];
}

/** Fallback: fetch a page of records and let server-side logic find today's row (for text-date fields) */
async function fetchRecordsPage(baseId: string, table: string, apiKey: string, maxRecords = 200) {
  const params = new URLSearchParams();
  params.set('pageSize', String(Math.min(100, maxRecords)));
  if (AIRTABLE_VIEW) params.set('view', AIRTABLE_VIEW);
  // We don't set filterByFormula here; we pull records and search locally.
  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;

  const res = await safeFetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: REVALIDATE_SECONDS },
  });

  const payload = await res.json();
  return (payload.records ?? []) as any[];
}

/** Parse common date formats into YYYY-MM-DD or return null */
function parseCellDateToISO(cell: any): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (!s) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/');
    let mm = parts[0].padStart(2, '0');
    let dd = parts[1].padStart(2, '0');
    let yyyy = parts[2];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Try Date.parse
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

/** Select text from fields given a version preference or heuristics */
function selectTextFromFields(fields: Record<string, any>, versionPref?: string | null) {
  const vPref = versionPref ? String(versionPref).trim().toUpperCase() : null;

  const valueForVersion = (v: string) => {
    for (const key of Object.keys(fields)) {
      if (key.trim().toUpperCase() === v) return fields[key];
    }
    for (const key of Object.keys(fields)) {
      if (key.trim().toUpperCase().includes(v)) return fields[key];
    }
    return null;
  };

  if (vPref) {
    const txt = valueForVersion(vPref);
    if (txt && String(txt).trim()) return { text: String(txt), version: getReturnedVersionName(fields, vPref) };
  }

  // Prefer KJV/NKJV/NIV
  const prefs = ['KJV', 'NKJV', 'NIV'];
  for (const p of prefs) {
    const t = valueForVersion(p);
    if (t && String(t).trim()) return { text: String(t), version: getReturnedVersionName(fields, p) };
  }

  // Fallback: first textual field that's not Date/Reference/etc.
  for (const key of Object.keys(fields)) {
    const normalized = key.trim().toLowerCase();
    if (['date', 'reference', 'ref', 'id', 'createdtime'].includes(normalized)) continue;
    const val = fields[key];
    if (val && String(val).trim()) return { text: String(val), version: key };
  }

  return null;
}

function getReturnedVersionName(fields: Record<string, any>, vPref: string) {
  for (const key of Object.keys(fields)) {
    if (key.trim().toUpperCase() === vPref) return key;
  }
  for (const key of Object.keys(fields)) {
    if (key.trim().toUpperCase().includes(vPref)) return key;
  }
  return vPref;
}

/* ---------- Handler ---------- */
export async function GET(req: Request) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({ error: 'Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env variables' }, { status: 500 });
    }

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('version')?.trim() ?? null;
    const today = todayISODate();

    // 1) Try server-side filterByFormula on Date (best case: Date is a Date type in Airtable)
    try {
      const filtered = await fetchRecordByDateFilter(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY, today);
      if (filtered && filtered.length > 0) {
        const rec = filtered[0];
        const fields = rec.fields ?? {};
        const selected = selectTextFromFields(fields, versionParam);
        if (selected?.text) {
          return NextResponse.json(
            {
              text: selected.text,
              reference: String(fields.Reference ?? fields.reference ?? '') || '',
              version: selected.version ?? null,
              date: fields.Date ?? fields.date ?? null,
              source: 'Airtable (filtered)',
            },
            { status: 200 },
          );
        }
        // If the filtered record exists but doesn't have the requested version textual field,
        // fall through to fallback logic below.
      }
    } catch (err: any) {
      // If filter attempt errors (e.g., Date isn't a proper field or formula problem), log and continue to fallback.
      console.warn('[todays-scripture] Airtable filterByFormula attempt failed:', err?.message ?? err);
    }

    // 2) Fallback: fetch a page of records and search locally for today's date in the Date/text field.
    const pageRecords = await fetchRecordsPage(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY, 200);
    // Look for a record whose Date column (or potential date fields) parse to today
    for (const r of pageRecords) {
      const f = r.fields ?? {};
      // Check common Date field names
      const rawDate =
        f.Date ?? f.date ?? f['Date (text)'] ?? f['DateString'] ?? f['Date String'] ?? null;
      const parsed = parseCellDateToISO(rawDate);
      if (parsed === today) {
        const selected = selectTextFromFields(f, versionParam);
        if (selected?.text) {
          return NextResponse.json(
            {
              text: selected.text,
              reference: String(f.Reference ?? f.reference ?? '') || '',
              version: selected.version ?? null,
              date: rawDate ?? null,
              source: 'Airtable (fallback page)',
            },
            { status: 200 },
          );
        }
      }
    }

    // 3) Nothing found
    return NextResponse.json({ error: 'No scripture found for today' }, { status: 404 });
  } catch (err: any) {
    console.error('[todays-scripture] error fetching from Airtable', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
