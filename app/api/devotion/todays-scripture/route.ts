import { NextResponse } from 'next/server';

/**
 * Today's Scripture API (Airtable-backed) — timezone-aware matching + debug output
 *
 * Tries server-side filterByFormula for both UTC and local date strings, then falls back
 * to paging through records and checking parsed dates against both UTC and local.
 *
 * Env:
 * - AIRTABLE_API_KEY
 * - AIRTABLE_BASE_ID
 * - AIRTABLE_TABLE (defaults to 'Scripture' or 'Sheet4')
 * - AIRTABLE_VIEW (optional)
 * - AIRTABLE_REVALIDATE_SECONDS (optional)
 *
 * Query params:
 * - version=KJV|NKJV|NIV
 * - debug=1 (optional) — include debug details in the JSON response
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Scripture';
const AIRTABLE_VIEW = process.env.AIRTABLE_VIEW || '';
const REVALIDATE_SECONDS = Number(process.env.AIRTABLE_REVALIDATE_SECONDS ?? process.env.SHEET_REVALIDATE_SECONDS ?? '60');

function todayUTCISO() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function safeFetch(url: string, init: RequestInit) {
  console.log('[todays-scripture] Airtable request URL:', url);
  const res = await fetch(url, init);
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const err: any = new Error(`Airtable API error ${res.status}: ${text || res.statusText}`);
    err.status = res.status;
    err.body = text;
    err.url = url;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function fetchWithFormula(baseId: string, table: string, apiKey: string, formula: string) {
  const params = new URLSearchParams();
  params.set('pageSize', '1');
  params.set('filterByFormula', formula);
  if (AIRTABLE_VIEW) params.set('view', AIRTABLE_VIEW);
  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
  return await safeFetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
}

async function fetchPage(baseId: string, table: string, apiKey: string, pageSize = 100) {
  const params = new URLSearchParams();
  params.set('pageSize', String(Math.min(100, pageSize)));
  if (AIRTABLE_VIEW) params.set('view', AIRTABLE_VIEW);
  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
  return await safeFetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
}

function parseCellDateToISO(cell: any): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/');
    let mm = parts[0].padStart(2, '0');
    let dd = parts[1].padStart(2, '0');
    let yyyy = parts[2];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

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

  const prefs = ['KJV', 'NKJV', 'NIV'];
  for (const p of prefs) {
    const t = valueForVersion(p);
    if (t && String(t).trim()) return { text: String(t), version: getReturnedVersionName(fields, p) };
  }

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
    const debug = url.searchParams.get('debug') === '1';
    const versionParam = url.searchParams.get('version')?.trim() ?? null;

    const utcDate = todayUTCISO();
    const localDate = todayLocalISO();

    // Try server-side filter with UTC date, then local date
    const triedFormulas: string[] = [];
    try {
      // formula expects single quotes around date literal
      const formulaUTC = `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${utcDate}'`;
      triedFormulas.push(formulaUTC);
      const resUTC = await fetchWithFormula(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY, formulaUTC);
      if (Array.isArray(resUTC.records) && resUTC.records.length > 0) {
        const rec = resUTC.records[0];
        const fields = rec.fields ?? {};
        const sel = selectTextFromFields(fields, versionParam);
        if (sel?.text) {
          return NextResponse.json({ text: sel.text, reference: String(fields.Reference ?? fields.reference ?? ''), version: sel.version ?? null, date: fields.Date ?? null, source: 'Airtable (filter UTC)' }, { status: 200 });
        }
      }

      const formulaLocal = `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${localDate}'`;
      triedFormulas.push(formulaLocal);
      const resLocal = await fetchWithFormula(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY, formulaLocal);
      if (Array.isArray(resLocal.records) && resLocal.records.length > 0) {
        const rec = resLocal.records[0];
        const fields = rec.fields ?? {};
        const sel = selectTextFromFields(fields, versionParam);
        if (sel?.text) {
          return NextResponse.json({ text: sel.text, reference: String(fields.Reference ?? fields.reference ?? ''), version: sel.version ?? null, date: fields.Date ?? null, source: 'Airtable (filter Local)' }, { status: 200 });
        }
      }
    } catch (err: any) {
      console.warn('[todays-scripture] filterByFormula attempt failed:', String(err?.message ?? err));
      // continue to fallback
    }

    // Fallback: page and search
    try {
      const pagePayload = await fetchPage(AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_API_KEY, 200);
      const records = pagePayload.records ?? [];
      const testedDates: string[] = [];
      for (const r of records) {
        const f = r.fields ?? {};
        const rawDate = f.Date ?? f.date ?? f['Date (text)'] ?? f['DateString'] ?? f['Date String'] ?? null;
        const parsed = parseCellDateToISO(rawDate);
        if (parsed) testedDates.push(parsed);
        // match against both UTC and local
        if (parsed === utcDate || parsed === localDate) {
          const sel = selectTextFromFields(f, versionParam);
          if (sel?.text) {
            const resp = { text: sel.text, reference: String(f.Reference ?? f.reference ?? ''), version: sel.version ?? null, date: rawDate ?? null, source: 'Airtable (page fallback)' };
            return NextResponse.json(debug ? { ...resp, debug: { utcDate, localDate, parsedDates: testedDates.slice(0, 20) } } : resp, { status: 200 });
          }
        }
      }
      // nothing found
      const notFoundResp: any = { error: 'No scripture found for today', checkedDates: { utcDate, localDate, sampleParsedDates: [] } };
      notFoundResp.checkedDates.sampleParsedDates = testedDates.slice(0, 20);
      if (debug) {
        // also include the raw page payload keys for troubleshooting (don't expose API key)
        notFoundResp.debug = { recordsSampleCount: records.length, triedFormulas };
      }
      return NextResponse.json(notFoundResp, { status: 404 });
    } catch (err: any) {
      console.error('[todays-scripture] page fetch failed:', String(err?.message ?? err));
      return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[todays-scripture] unexpected error', String(err?.message ?? err));
    return NextResponse.json({ error: 'Failed to fetch scripture', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
