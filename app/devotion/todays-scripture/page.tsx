import React from 'react';
import TodaysScriptureClient from './TodaysScriptureClient';

type Scripture = {
  text: string;
  reference: string;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

/**
 * Server-side page that fetches today's scripture directly from Google Sheets
 * (public sheet via API key) using Next fetch with ISR (revalidate).
 *
 * Env vars required for public-sheet mode:
 * - SPREADSHEET_ID
 * - GOOGLE_SHEETS_API_KEY
 * Optional:
 * - SHEET_RANGE (defaults to 'Sheet1')
 * - SHEET_REVALIDATE_SECONDS (defaults to 60)
 */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1';
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const REVALIDATE_SECONDS = Number(process.env.SHEET_REVALIDATE_SECONDS ?? '60');

function normalizeHeader(h: string) {
  return String(h ?? '').trim().toLowerCase();
}

function mapRowToObject(headers: string[], row: string[]) {
  const headerIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) headerIndex[normalizeHeader(headers[i])] = i;

  const headersMapping: Record<string, string[]> = {
    date: ['date', 'day', 'published_at'],
    text: ['text', 'scripture', 'verse', 'body'],
    reference: ['reference', 'ref'],
    version: ['version'],
    source: ['source'],
  };

  const result: any = { date: null, text: null, reference: null, version: null, source: null };

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

async function fetchTodaysScriptureFromSheet(): Promise<Scripture | null> {
  if (!SPREADSHEET_ID) {
    console.error('[todays-scripture] missing SPREADSHEET_ID env var');
    return null;
  }
  if (!GOOGLE_API_KEY) {
    console.error('[todays-scripture] missing GOOGLE_SHEETS_API_KEY env var');
    return null;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    SPREADSHEET_ID,
  )}/values/${encodeURIComponent(SHEET_RANGE)}?key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[todays-scripture] Google Sheets API error', res.status, body);
      return null;
    }
    const payload = await res.json();
    const values: string[][] = payload.values ?? [];
    if (values.length < 2) return null;

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
        return new Date(parsed).toISOString().slice(0, 10) === today;
      }
      if (d.includes('/')) {
        const parts = d.split('/');
        if (parts.length === 3) {
          const mm = parts[0].padStart(2, '0');
          const dd = parts[1].padStart(2, '0');
          const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          return `${yyyy}-${mm}-${dd}` === today;
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
  } catch (err: any) {
    console.error('[todays-scripture] fetch failed', err?.message ?? err);
    return null;
  }
}

export default async function Page() {
  const scripture = await fetchTodaysScriptureFromSheet();

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Today's Scripture</h1>
        <p className="text-sm text-muted-foreground">A short reflection to begin your day</p>
      </header>

      <section className="bg-white shadow rounded-lg p-6">
        {scripture ? (
          <>
            <article className="prose max-w-none">
              <p className="text-lg leading-relaxed">{scripture.text}</p>
              <p className="mt-4 font-medium">
                — {scripture.reference}
                {scripture.version ? <span className="text-sm font-normal"> ({scripture.version})</span> : null}
              </p>
              {scripture.date ? <p className="text-xs text-muted-foreground mt-2">Date: {scripture.date}</p> : null}
              {scripture.source ? <p className="text-xs text-muted-foreground mt-1">Source: {scripture.source}</p> : null}
            </article>

            <div className="mt-6">
              <TodaysScriptureClient initialScripture={scripture} />
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">We couldn't load today's scripture right now. Try refreshing the page.</p>
            <div className="mt-4">
              <TodaysScriptureClient initialScripture={null} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
