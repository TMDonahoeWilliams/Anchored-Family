import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Airtable-backed)
 *
 * Env vars:
 * - AIRTABLE_API_KEY (required)
 * - AIRTABLE_BASE_ID (required)
 * - AIRTABLE_TABLE (optional, default: "Sheet4")
 * - AIRTABLE_REVALIDATE_SECONDS (optional, default: 60)
 *
 * Behavior:
 * - Fetches records from Airtable table (pages through results).
 * - Looks for a record whose Date field matches today's date (accepts multiple formats).
 * - Selects the scripture text from the requested version column (query ?version=KJV|NKJV|NIV)
 *   or attempts to autodetect the version column (KJV, NKJV, NIV, or first matching field).
 * - Returns JSON: { text, reference, version?, date?, source? } or 404 if nothing found.
 *
 * Notes:
 * - This route is intended to replace the previous Google Sheets logic.
 * - Client code should call /api/devotion/todays-scripture?version=NIV (or KJV/NKJV) as before.
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Sheet4';
const REVALIDATE_SECONDS = Number(process.env.AIRTABLE_REVALIDATE_SECONDS ?? process.env.SHEET_REVALIDATE_SECONDS ?? '60');

/* ---------- Helpers ---------- */

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Try to parse common date cell formats into YYYY-MM-DD or return null */
function parseCellDateToISO(cell: any): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (!s) return null;
  // 1) ISO-like YYYY-MM-DD or full ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  // 2) MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/');
    let mm = parts[0].padStart(2, '0');
    let dd = parts[1].padStart(2, '0');
    let yyyy = parts[2];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** Fetch all records from an Airtable table (will page through results). */
async function fetchAllAirtableRecords(baseId: string, table: string, apiKey: string) {
  if (!apiKey) throw new Error('Missing AIRTABLE_API_KEY');
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID');

  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
  const records: any[] = [];
  let offset: string | undefined = undefined;

  // Loop to page through results (Airtable returns up to 100 records per page)
  for (let i = 0; i < 50; i++) {
    const url = new URL(endpoint);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    // optionally you could set a view or maxRecords here
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Cache control for Next.js ISR
      // This instructs Next to revalidate the response of this fetch server-side.
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Airtable API error ${res.status}: ${txt}`);
    }

    const payload = await res.json();
    if (Array.isArray(payload.records)) {
      records.push(...payload.records);
    }
    offset = payload.offset;
    if (!offset) break;
  }

  return records;
}

/** Choose the scripture record and version field based on date and version preference */
function chooseScriptureFromRecords(records: any[], versionPref?: string | null) {
  if (!records || records.length === 0) return null;
  const today = todayISODate();
  const vPref = versionPref ? String(versionPref).trim().toUpperCase() : null;

  // Normalize candidate version field names in a record
  const versionFieldCandidates = (fields: Record<string, any>) =>
    Object.keys(fields).filter((k) => !!k).map((k) => k);

  // Helper to get value for a version, given fields object
  const valueForVersion = (fields: Record<string, any>, v: string) => {
    // Try exact match first
    for (const key of Object.keys(fields)) {
      if (key.trim().toUpperCase() === v) return fields[key];
    }
    // Try includes (e.g. "NIV (Study)" or "NIV Reference")
    for (const key of Object.keys(fields)) {
      if (key.trim().toUpperCase().includes(v)) return fields[key];
    }
    return null;
  };

  // 1) If versionPref: try find record with date == today and version cell present
  if (vPref) {
    for (const r of records) {
      const f = r.fields ?? {};
      const cellDate = parseCellDateToISO(f.Date ?? f.date ?? f.DateString ?? null);
      if (cellDate === today) {
        const txt = valueForVersion(f, vPref);
        if (txt && String(txt).trim()) {
          return {
            text: String(txt),
            reference: String(f.Reference ?? f.reference ?? '') || '',
            version: getReturnedVersionName(f, vPref),
            date: f.Date ?? null,
            source: 'Airtable',
          };
        }
      }
    }
  }

  // 2) Try any record with today's date, pick autodetected version column (KJV/NKJV/NIV preferred)
  for (const r of records) {
    const f = r.fields ?? {};
    const cellDate = parseCellDateToISO(f.Date ?? f.date ?? f.DateString ?? null);
    if (cellDate === today) {
      // prefer exact version fields in this order if present
      const prefs = ['KJV', 'NKJV', 'NIV'];
      for (const pv of prefs) {
        const val = valueForVersion(f, pv);
        if (val && String(val).trim()) {
          return {
            text: String(val),
            reference: String(f.Reference ?? f.reference ?? '') || '',
            version: getReturnedVersionName(f, pv),
            date: f.Date ?? null,
            source: 'Airtable',
          };
        }
      }
      // fallback: pick first non-date, non-reference field that seems textual
      for (const key of versionFieldCandidates(f)) {
        const normalized = key.trim().toLowerCase();
        if (['date', 'reference', 'ref', 'id', 'createdtime'].includes(normalized)) continue;
        const val = f[key];
        if (val && String(val).trim()) {
          return {
            text: String(val),
            reference: String(f.Reference ?? f.reference ?? '') || '',
            version: key,
            date: f.Date ?? null,
            source: 'Airtable',
          };
        }
      }
    }
  }

  // 3) If versionPref present, try any record that has that version column
  if (vPref) {
    for (const r of records) {
      const f = r.fields ?? {};
      const txt = valueForVersion(f, vPref);
      if (txt && String(txt).trim()) {
        return {
          text: String(txt),
          reference: String(f.Reference ?? f.reference ?? '') || '',
          version: getReturnedVersionName(f, vPref),
          date: f.Date ?? null,
          source: 'Airtable (fallback by version)',
        };
      }
    }
  }

  // 4) Fallback: first record with any non-empty text field (excluding date/ref)
  for (const r of records) {
    const f = r.fields ?? {};
    for (const key of versionFieldCandidates(f)) {
      const normalized = key.trim().toLowerCase();
      if (['date', 'reference', 'ref', 'id', 'createdtime'].includes(normalized)) continue;
      const val = f[key];
      if (val && String(val).trim()) {
        return {
          text: String(val),
          reference: String(f.Reference ?? f.reference ?? '') || '',
          version: key,
          date: f.Date ?? null,
          source: 'Airtable (fallback first)',
        };
      }
    }
  }

  return null;
}

/** Helper to return the 'version' name we actually used (if we matched by token) */
function getReturnedVersionName(fields: Record<string, any>, vPref: string) {
  if (!vPref) return null;
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
      return NextResponse.json(
        { error: 'Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env variables' },
        { status: 500 },
      );
    }

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('version')?.trim() ?? null;

    // Fetch records
    const records = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY);
    const scripture = chooseScriptureFromRecords(records, versionParam);

    if (!scripture) {
      return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
    }

    return NextResponse.json(scripture, { status: 200 });
  } catch (err: any) {
    console.error('[todays-scripture] error fetching from Airtable', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Support POST the same as GET for convenience
  return GET(req);
}
