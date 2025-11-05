import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Google Sheets-backed)
 *
 * Behavior updated per request:
 * - Looks for today's date specifically in column A (index 0) of the sheet.
 * - Finds the requested version by matching the header row (e.g. "KJV", "NKJV", "NIV").
 *   The header row is expected to be the first row of the values returned.
 * - Returns the cell under the version-column for the row whose column-A date matches today.
 * - For reference, the handler will:
 *   - prefer using a dedicated "reference" (or "ref") header column if present, or
 *   - fall back to leaving reference empty.
 *
 * Query params:
 * - version=KJV|NKJV|NIV (optional) — if omitted, the handler will pick the first version-like column it finds.
 *
 * Env vars:
 * - SPREADSHEET_ID (required)
 * - SHEET_RANGE (optional, defaults to 'Sheet1!A:Z' recommended)
 * - GOOGLE_SHEETS_API_KEY (optional for public sheets)
 * - GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_B64 (optional for private sheets)
 * - SHEET_REVALIDATE_SECONDS (optional TTL; default 60)
 *
 * Notes:
 * - If your tab name or range contains spaces/special chars, set SHEET_RANGE to a proper A1 range
 *   (e.g. "'Today's Scripture'!A:Z" or "Sheet1!A:Z"). The handler will also try sensible fallbacks.
 */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1!A:Z';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const GOOGLE_SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
  (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64 ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, 'base64').toString('utf8') : '');
const REVALIDATE_SECONDS = Number(process.env.SHEET_REVALIDATE_SECONDS ?? '60');

function normalize(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a date-like value from a cell (supports YYYY-MM-DD, MM/DD/YYYY, JS Date strings)
 * Returns ISO YYYY-MM-DD or null.
 */
function parseCellDateToISO(cell: any): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (!s) return null;
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try MM/DD/YYYY or M/D/YYYY
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

/* ---------- Helpers to find header indices ---------- */
function findVersionHeaderIndex(headers: string[], versionPref?: string | null) {
  const normalizedHeaders = headers.map((h) => normalize(h));
  const vPref = versionPref ? normalize(versionPref) : null;

  // If explicit version pref, try exact match then includes.
  if (vPref) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (normalizedHeaders[i] === vPref) return i;
    }
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (normalizedHeaders[i].includes(vPref)) return i;
    }
  }

  // If no pref or not found, heuristics: pick first header that's not 'date'/'reference'/'ref'/'source'/'version'
  const forbidden = new Set(['date', 'reference', 'ref', 'version', 'source']);
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (!forbidden.has(normalizedHeaders[i]) && normalizedHeaders[i]) return i;
  }

  // fallback: second column (index 1) if exists
  if (headers.length > 1) return 1;
  return 0;
}

function findReferenceHeaderIndex(headers: string[]) {
  const normalizedHeaders = headers.map((h) => normalize(h));
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (['reference', 'ref'].includes(normalizedHeaders[i])) return i;
  }
  return -1;
}

/* ---------- Google Sheets fetchers (public + service account) ---------- */
/* Note: we re-use a focused approach: get values array (2D), assume headerRow = values[0] */
async function fetchValuesPublic(spreadsheetId: string, range: string) {
  if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_SHEETS_API_KEY');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(GOOGLE_API_KEY)}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error ${res.status}: ${txt}`);
  }
  const payload = await res.json();
  return (payload.values as string[][]) ?? [];
}

async function fetchValuesServiceAccount(spreadsheetId: string, range: string, keyJson: string) {
  // dynamic import of googleapis to avoid bundler issues when not installed
  let google: any;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const googleModule = await new Function('return import("googleapis")')();
    google = googleModule?.google;
    if (!google) throw new Error('googleapis module missing');
  } catch (err: any) {
    throw new Error('Failed to load googleapis at runtime: ' + String(err?.message ?? err));
  }

  const key = JSON.parse(keyJson);
  const client = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  await client.authorize();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return (resp.data.values as string[][]) ?? [];
}

/* ---------- Core logic: read values, find row by column-A date, pick version column ---------- */
async function pickScriptureFromValues(values: string[][], versionPref?: string | null) {
  if (!values || values.length === 0) return null;
  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);
  if (dataRows.length === 0) return null;

  const today = todayISODate();

  // find reference column if any
  const refIdx = findReferenceHeaderIndex(headerRow);

  // find version column index using header row and requested version
  const versionIdx = findVersionHeaderIndex(headerRow, versionPref);

  // look for a row that has today's date in column A (index 0)
  for (const row of dataRows) {
    const cellDateIso = parseCellDateToISO(row[0]);
    if (cellDateIso && cellDateIso === today) {
      const text = row[versionIdx] ?? null;
      const reference = refIdx >= 0 ? (row[refIdx] ?? '') : '';
      if (text && String(text).trim()) {
        return {
          text: String(text),
          reference: String(reference ?? '').trim(),
          version: headerRow[versionIdx] ?? null,
          date: row[0] ?? null,
          source: 'Google Sheets',
        };
      }
      // if the version cell is empty for today's row, continue searching other rows (or fallback)
    }
  }

  // If no exact today match, fallback strategies:
  // 1) If version column exists, find any row that has a non-empty cell in that version column (prefer most recent / first)
  for (const row of dataRows) {
    const text = row[versionIdx] ?? null;
    if (text && String(text).trim()) {
      const reference = refIdx >= 0 ? (row[refIdx] ?? '') : '';
      return {
        text: String(text),
        reference: String(reference ?? '').trim(),
        version: headerRow[versionIdx] ?? null,
        date: row[0] ?? null,
        source: 'Google Sheets (fallback)',
      };
    }
  }

  // 2) As last resort return null
  return null;
}

/* ---------- Handler ---------- */
export async function GET(req: Request) {
  try {
    if (!SPREADSHEET_ID) {
      return NextResponse.json({ error: 'Missing SPREADSHEET_ID env variable' }, { status: 500 });
    }

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('version')?.trim() ?? null;

    // Try service account first (private sheets)
    if (GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const values = await fetchValuesServiceAccount(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_SERVICE_ACCOUNT_KEY);
        const scripture = await pickScriptureFromValues(values, versionParam);
        if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
        return NextResponse.json(scripture, { status: 200 });
      } catch (err: any) {
        console.error('[todays-scripture] service-account fetch failed', err?.message ?? err);
        // fall through to public method
      }
    }

    // Public-sheet fallback (API key)
    if (GOOGLE_API_KEY) {
      try {
        const values = await fetchValuesPublic(SPREADSHEET_ID, SHEET_RANGE);
        const scripture = await pickScriptureFromValues(values, versionParam);
        if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
        return NextResponse.json(scripture, { status: 200 });
      } catch (err: any) {
        console.error('[todays-scripture] public fetch failed', err?.message ?? err);
        return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'No GOOGLE_SHEETS_API_KEY or GOOGLE_SERVICE_ACCOUNT_KEY provided. Set SPREADSHEET_ID and one of the keys.' },
      { status: 500 },
    );
  } catch (err: any) {
    console.error('[todays-scripture] error fetching sheet', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
