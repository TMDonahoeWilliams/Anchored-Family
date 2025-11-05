import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Google Sheets-backed)
 *
 * Two supported ways to read a sheet:
 * 1) Public or "reader" access Google Sheet using an API key (simple).
 *    - Set env: GOOGLE_SHEETS_API_KEY, SPREADSHEET_ID, SHEET_RANGE (optional).
 * 2) (Optional) Service account / googleapis approach – described below in comments.
 *
 * Sheet format expected (first row = header):
 * | date       | text                        | reference  | version | source |
 * | 2025-11-05 | For God so loved the world… | John 3:16  | ESV     | MySheet|
 *
 * Behavior:
 * - Fetches the sheet values (header + rows).
 * - Finds a row whose "date" column matches today's date (YYYY-MM-DD).
 * - If none match, returns the first data row as a fallback.
 * - Returns JSON: { text, reference, version?, date?, source? } or 404 if nothing found.
 *
 * Notes:
 * - If your sheet uses a different header names, set headersMapping below.
 * - For private sheets, use a service account approach (see comments).
 */

/* ---------- Config ---------- */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
// Range default: entire first sheet. You can set a named range like "Sheet1!A:E" or "Sheet1".
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';

/* Header mapping: normalize column names to these keys (case-insensitive) */
const headersMapping = {
  date: ['date', 'day', 'published_at'],
  text: ['text', 'scripture', 'verse', 'body'],
  reference: ['reference', 'ref'],
  version: ['version'],
  source: ['source'],
};

/* ---------- Helpers ---------- */
function normalizeHeader(h: string) {
  return String(h ?? '').trim().toLowerCase();
}

function mapRowToObject(headers: string[], row: string[]) {
  const obj: Record<string, string | null> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeader(headers[i]);
    obj[key] = row[i] ?? null;
  }

  // Find canonical keys by matching header synonyms
  const result: any = {
    date: null,
    text: null,
    reference: null,
    version: null,
    source: null,
  };

  for (const [canon, synonyms] of Object.entries(headersMapping)) {
    for (const syn of synonyms) {
      // find matching header key
      for (const headerKey of Object.keys(obj)) {
        if (headerKey === syn) {
          result[canon] = obj[headerKey];
          break;
        }
      }
      if (result[canon]) break;
    }
    // also try exact match on canonical name if nothing found
    if (!result[canon] && obj[canon]) result[canon] = obj[canon];
  }

  return result;
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------- Fetch from public sheet via API key ---------- */
async function fetchFromPublicSheet(spreadsheetId: string, range: string, apiKey: string) {
  if (!apiKey) {
    throw new Error('Missing GOOGLE_SHEETS_API_KEY');
  }
  if (!spreadsheetId) {
    throw new Error('Missing SPREADSHEET_ID');
  }

  // Use the Sheets values endpoint
  // Example: https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}?key={API_KEY}
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { next: { revalidate: 60 } }); // cache for 60s on server if you want
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error ${res.status}: ${txt}`);
  }
  const payload = await res.json();

  // payload.values is an array-of-arrays. First row is header.
  const values: string[][] = payload.values ?? [];
  if (values.length === 0) return null;

  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);

  // Map rows to objects
  const objects = dataRows.map((r) => mapRowToObject(headerRow, r));

  // Try to find today's row (by normalized date match YYYY-MM-DD)
  const today = todayISODate();
  const match = objects.find((o) => {
    const d = String(o.date ?? '').trim();
    if (!d) return false;
    // Accept several formats: YYYY-MM-DD, MM/DD/YYYY, MMM D YYYY, etc.
    if (d === today) return true;
    // try parse to Date and compare ISO
    const parsed = Date.parse(d);
    if (!isNaN(parsed)) {
      const dtIso = new Date(parsed).toISOString().slice(0, 10);
      if (dtIso === today) return true;
    }
    // fallback: compare only date part if d contains space
    if (d.includes(' ')) {
      const maybe = d.split(' ')[0];
      if (maybe === today) return true;
    }
    return false;
  });

  const chosen = match ?? objects[0] ?? null;

  if (!chosen || !chosen.text) return null;

  return {
    text: chosen.text,
    reference: chosen.reference ?? '',
    version: chosen.version ?? null,
    date: chosen.date ?? null,
    source: chosen.source ?? null,
  };
}

/* ---------- Optional: service account approach (private sheet) ----------
If your sheet is private, you'll need to use OAuth2 / a service account.
Below is a reference implementation sketch using googleapis. If you prefer
this route, install googleapis and set GOOGLE_SERVICE_ACCOUNT_KEY (JSON string).

Example (not enabled by default in this file):
  npm i googleapis

Then you can do:

import { google } from 'googleapis';
const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
const client = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
await client.authorize();
const sheets = google.sheets({ version: 'v4', auth: client });
const resp = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID,
  range: SHEET_RANGE,
});

This will return resp.data.values like the public API above.
---------------------------------------------------------------------------*/

/* ---------- Handler ---------- */
export async function GET() {
  try {
    // Prefer API key/public-sheet method when GOOGLE_SHEETS_API_KEY is set.
    if (GOOGLE_API_KEY) {
      const scripture = await fetchFromPublicSheet(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_API_KEY);
      if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
      return NextResponse.json(scripture, { status: 200 });
    }

    // If no API key, return an informative error so deployers know what's missing.
    return NextResponse.json(
      { error: 'No GOOGLE_SHEETS_API_KEY provided. Set env var SPREADSHEET_ID and GOOGLE_SHEETS_API_KEY.' },
      { status: 500 },
    );
  } catch (err: any) {
    console.error('[todays-scripture] error fetching sheet', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

// Allow POST for convenience (client refresh may use GET; keep POST supported)
export async function POST(req: Request) {
  return GET();
}
