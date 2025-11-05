import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Google Sheets-backed)
 *
 * Improvements made:
 * - Added configurable revalidate TTL via SHEET_REVALIDATE_SECONDS (default 60s).
 * - Improved header-to-column mapping (normalizes headers & synonyms).
 * - Added optional service-account (googleapis) support when GOOGLE_SERVICE_ACCOUNT_KEY is provided.
 *   To avoid Turbopack build errors when googleapis is not installed, the service-account import
 *   is performed indirectly at runtime using `new Function('return import("googleapis")')()`.
 *   This prevents the bundler from statically resolving 'googleapis' during build.
 *
 * Env vars used:
 * - SPREADSHEET_ID (required)
 * - SHEET_RANGE (optional, defaults to 'Sheet1')
 * - GOOGLE_SHEETS_API_KEY (optional for public sheets)
 * - GOOGLE_SERVICE_ACCOUNT_KEY (optional JSON string for private sheets)
 * - SHEET_REVALIDATE_SECONDS (optional TTL for server cache; default 60)
 *
 * If you enable service-account usage, install `googleapis` in your project:
 *   pnpm add googleapis
 */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const REVALIDATE_SECONDS = Number(process.env.SHEET_REVALIDATE_SECONDS ?? '60');

/* Header mapping: synonyms (all compared normalized, lowercase) */
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

/**
 * Build a map from normalized header -> column index for fast lookup,
 * then map a data row to a canonical object using headersMapping synonyms.
 */
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
    // try synonyms first
    let found: string | null = null;
    for (const syn of synonyms) {
      const idx = headerIndex[normalizeHeader(syn)];
      if (typeof idx === 'number') {
        found = row[idx] ?? null;
        break;
      }
    }
    // fallback: exact canonical header
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

/* ---------- Fetch from public sheet via API key ---------- */
async function fetchFromPublicSheet(spreadsheetId: string, range: string, apiKey: string) {
  if (!apiKey) {
    throw new Error('Missing GOOGLE_SHEETS_API_KEY');
  }
  if (!spreadsheetId) {
    throw new Error('Missing SPREADSHEET_ID');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error ${res.status}: ${txt}`);
  }
  const payload = await res.json();

  const values: string[][] = payload.values ?? [];
  if (values.length === 0) return null;

  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);

  const objects = dataRows.map((r) => mapRowToObject(headerRow, r));

  const today = todayISODate();
  const match = objects.find((o) => {
    const d = String(o.date ?? '').trim();
    if (!d) return false;
    if (d === today) return true;
    const parsed = Date.parse(d);
    if (!isNaN(parsed)) {
      const dtIso = new Date(parsed).toISOString().slice(0, 10);
      if (dtIso === today) return true;
    }
    // numeric US-style like 11/05/2025
    if (d.includes('/')) {
      const parts = d.split('/');
      if (parts.length === 3) {
        const mm = parts[0].padStart(2, '0');
        const dd = parts[1].padStart(2, '0');
        const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        if (`${yyyy}-${mm}-${dd}` === today) return true;
      }
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

/* ---------- Fetch via Google service account (private sheet) ---------- */
async function fetchFromServiceAccount(spreadsheetId: string, range: string, keyJson: string) {
  if (!keyJson) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  }

  // Use an indirect dynamic import to avoid Turbopack resolving 'googleapis' at build time.
  // This attempts to import at runtime on the server only.
  let google: any;
  try {
    // Indirect dynamic import via Function to prevent bundlers from statically analyzing import.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const googleModule = await new Function('return import("googleapis")')();
    google = googleModule?.google;
    if (!google) throw new Error('googleapis module did not expose `google` export');
  } catch (err: any) {
    // Provide a clear error hint — prefer installing googleapis or removing service account usage.
    throw new Error(
      'Failed to load googleapis at runtime. Install googleapis (pnpm add googleapis) or unset GOOGLE_SERVICE_ACCOUNT_KEY. Original error: ' +
        String(err?.message ?? err),
    );
  }

  const key = JSON.parse(keyJson);
  if (!key.client_email || !key.private_key) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON (missing client_email or private_key)');
  }

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

  const values: string[][] = (resp.data.values as any) ?? [];
  if (!values.length) return null;

  const headerRow = values[0].map(String);
  const dataRows = values.slice(1);
  const objects = dataRows.map((r) => mapRowToObject(headerRow, r));

  const today = todayISODate();
  const match = objects.find((o) => {
    const d = String(o.date ?? '').trim();
    if (!d) return false;
    if (d === today) return true;
    const parsed = Date.parse(d);
    if (!isNaN(parsed)) {
      const dtIso = new Date(parsed).toISOString().slice(0, 10);
      if (dtIso === today) return true;
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

/* ---------- Handler ---------- */
export async function GET() {
  try {
    if (!SPREADSHEET_ID) {
      return NextResponse.json({ error: 'Missing SPREADSHEET_ID env variable' }, { status: 500 });
    }

    // Prefer service account if provided (private sheet)
    if (GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const scripture = await fetchFromServiceAccount(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_SERVICE_ACCOUNT_KEY);
        if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
        return NextResponse.json(scripture, { status: 200 });
      } catch (err: any) {
        console.error('[todays-scripture] service-account fetch failed', err?.message ?? err);
        // fall through to try public key method if available
      }
    }

    if (GOOGLE_API_KEY) {
      const scripture = await fetchFromPublicSheet(SPREADSHEET_ID, SHEET_RANGE, GOOGLE_API_KEY);
      if (!scripture) return NextResponse.json({ error: 'No scripture found' }, { status: 404 });
      return NextResponse.json(scripture, { status: 200 });
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
  return GET();
}
