import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Google Sheets-backed)
 * - Robust range handling: if a given range (e.g. "Sheet1") causes "Unable to parse range",
 *   the code will retry with sensible fallbacks like "Sheet1!A:Z" and "Sheet1!A:E".
 *
 * Env:
 * - SPREADSHEET_ID (required)
 * - SHEET_RANGE (optional; if it's just a sheet name the code will attempt fallbacks)
 * - GOOGLE_SHEETS_API_KEY (public sheets)
 * - GOOGLE_SERVICE_ACCOUNT_KEY (private sheets; JSON string) OR GOOGLE_SERVICE_ACCOUNT_KEY_B64
 * - SHEET_REVALIDATE_SECONDS (optional TTL; default 60)
 */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const GOOGLE_SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
  (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64 ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, 'base64').toString('utf8') : '');
const REVALIDATE_SECONDS = Number(process.env.SHEET_REVALIDATE_SECONDS ?? '60');

const headersMapping: Record<string, string[]> = {
  date: ['date', 'day', 'published_at'],
  text: ['text', 'scripture', 'verse', 'body'],
  reference: ['reference', 'ref'],
  version: ['version'],
  source: ['source'],
};

function normalizeHeader(h: string) {
  return String(h ?? '').trim().toLowerCase();
}

function mapRowToObject(headers: string[], row: string[]) {
  const headerIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    headerIndex[normalizeHeader(headers[i])] = i;
  }

  const result: any = {
    date: null,
    text: null,
    reference: null,
    version: null,
    source: null,
  };

  for (const [canon, synonyms] of Object.entries(headersMapping)) {
    let found: string | null = null;
    for (const syn of synonyms) {
      const idx = headerIndex[normalizeHeader(syn)];
      if (typeof idx === 'number') {
        found = row[idx] ?? null;
        break;
      }
    }
    if (!found) {
      const idx = headerIndex[canon];
      if (typeof idx === 'number') found = row[idx] ?? null;
    }
    result[canon] = found ?? null;
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

function chooseScripture(objects: any[], versionPref?: string | null) {
  if (!objects || objects.length === 0) return null;
  const today = todayISODate();
  const vPref = versionPref ? String(versionPref).trim().toUpperCase() : null;

  if (vPref) {
    const match = objects.find((o) => {
      const d = String(o.date ?? '').trim();
      const ver = String(o.version ?? '').trim().toUpperCase();
      if (!d || !ver) return false;
      if (d === today) {
        if (ver === vPref) return true;
        if (ver.includes(vPref)) return true;
      }
      return false;
    });
    if (match && match.text) return match;
  }

  const dateMatch = objects.find((o) => {
    const d = String(o.date ?? '').trim();
    if (!d) return false;
    if (d === today) return true;
    const parsed = Date.parse(d);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10) === today;
    }
    return false;
  });
  if (dateMatch && dateMatch.text) return dateMatch;

  if (vPref) {
    const verAny = objects.find((o) => {
      const ver = String(o.version ?? '').trim().toUpperCase();
      if (!ver) return false;
      if (ver === vPref) return true;
      if (ver.includes(vPref)) return true;
      return false;
    });
    if (verAny && verAny.text) return verAny;
  }

  return objects[0];
}

/* ---------- Helpers for trying alternate ranges ---------- */
const RANGE_FALLBACKS = (rangeBase: string) => [
  rangeBase,
  `${rangeBase}!A:Z`,
  `${rangeBase}!A:E`,
  `${rangeBase}!A:Z`, // duplicate safe
];

async function fetchValuesWithFallbacksPublic(spreadsheetId: string, rangeBase: string, apiKey: string) {
  if (!apiKey) throw new Error('Missing GOOGLE_SHEETS_API_KEY');
  if (!spreadsheetId) throw new Error('Missing SPREADSHEET_ID');

  let lastErr: any = null;
  for (const r of RANGE_FALLBACKS(rangeBase)) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(r)}?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        // If it's an invalid range, try next fallback
        if (res.status === 400 && txt.includes('Unable to parse range')) {
          lastErr = new Error(`Invalid range ${r}: ${txt}`);
          continue;
        }
        throw new Error(`Google Sheets API error ${res.status}: ${txt}`);
      }
      const payload = await res.json();
      return payload.values ?? [];
    } catch (err: any) {
      lastErr = err;
      // continue to next fallback if it's a parse/range issue; otherwise rethrow
      if (String(err?.message).includes('Unable to parse range')) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('Failed to fetch sheet with any fallback ranges');
}

async function fetchValuesWithFallbacksServiceAccount(spreadsheetId: string, rangeBase: string, keyJson: string) {
  // dynamic import
  let google: any;
  try {
    // avoid bundler static analysis
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const googleModule = await new Function('return import("googleapis")')();
    google = googleModule?.google;
    if (!google) throw new Error('googleapis module missing');
  } catch (err: any) {
    throw new Error(
      'Failed to load googleapis. Install it (pnpm add googleapis) or unset GOOGLE_SERVICE_ACCOUNT_KEY. Original: ' +
        String(err?.message ?? err),
    );
  }

  const key = JSON.parse(keyJson);
  const client = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  await client.authorize();
  const sheets = google.sheets({ version: 'v4', auth: client });

  let lastErr: any = null;
  for (const r of RANGE_FALLBACKS(rangeBase)) {
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: r,
      });
      return resp.data.values ?? [];
    } catch (err: any) {
      // detect invalid range and try next fallback
      const msg = String(err?.response?.data?.error?.message ?? err?.message ?? err);
      lastErr = new Error(msg);
      if (msg.includes('Unable to parse range')) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('Failed to fetch sheet with any fallback ranges (service account)');
}

/* ---------- Fetchers that use the above helpers ---------- */
async function fetchFromPublicSheet(spreadsheetId: string, rangeBase: string, apiKey: string, versionPref?: string | null) {
  const values: string[][] = (await fetchValuesWithFallbacksPublic(spreadsheetId, rangeBase, apiKey)) ?? [];
  if (!values.length) return null;
  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);
  const objects = dataRows.map((r) => mapRowToObject(headerRow, r));
  const chosen = chooseScripture(objects, versionPref);
  if (!chosen || !chosen.text) return null;
  return {
    text: chosen.text,
    reference: chosen.reference ?? '',
    version: chosen.version ?? null,
    date: chosen.date ?? null,
    source: chosen.source ?? null,
  };
}

async function fetchFromServiceAccount(spreadsheetId: string, rangeBase: string, keyJson: string, versionPref?: string | null) {
  const values: string[][] = (await fetchValuesWithFallbacksServiceAccount(spreadsheetId, rangeBase, keyJson)) ?? [];
  if (!values.length) return null;
  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);
  const objects = dataRows.map((r) => mapRowToObject(headerRow, r));
  const chosen = chooseScripture(objects, versionPref);
  if (!chosen || !chosen.text) return null;
  return {
    text: chosen.text,
    reference: chosen.reference ?? '',
    version: chosen.version ?? null,
    date: chosen.date ?? null,
    source: chosen.source ?? null,
  };
}

/* ---------- Handler ---------- */
export async function GET(req: Request) {
  try {
    if (!SPREADSHEET_ID) {
      return NextResponse.json({ error: 'Missing SPREADSHEET_ID env variable' }, { status: 500 });
    }

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('version')?.trim() ?? null;

    // Prefer service account if provided (private sheet)
    if (GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const scripture = await fetchFromServiceAccount(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_SERVICE_ACCOUNT_KEY, versionParam);
        if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
        return NextResponse.json(scripture, { status: 200 });
      } catch (err: any) {
        console.error('[todays-scripture] service-account fetch failed', err?.message ?? err);
        // fall through to public method if available
      }
    }

    if (GOOGLE_API_KEY) {
      try {
        const scripture = await fetchFromPublicSheet(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_API_KEY, versionParam);
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
