import { NextResponse } from 'next/server';

/**
 * Debug endpoint for Google Sheets access.
 * - Do NOT leave this deployed long-term in production.
 * - It returns: detected client_email from service-account JSON, spreadsheetId, and either
 *   spreadsheet metadata (title + sheet tabs) OR the Google API error object.
 *
 * Env:
 * - SPREADSHEET_ID (required)
 * - GOOGLE_SERVICE_ACCOUNT_KEY (raw JSON) OR GOOGLE_SERVICE_ACCOUNT_KEY_B64 (base64 JSON)
 *
 * Usage:
 * curl -i https://<your-site>/api/devotion/todays-scripture/debug
 *
 * NOTE: This endpoint intentionally does not return the private key.
 */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const RAW_KEY =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
  (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64 ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, 'base64').toString('utf8') : '');

export async function GET() {
  if (!SPREADSHEET_ID) {
    return NextResponse.json({ error: 'Missing SPREADSHEET_ID env var' }, { status: 500 });
  }

  if (!RAW_KEY) {
    return NextResponse.json(
      { error: 'Missing service account key. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_B64' },
      { status: 500 },
    );
  }

  let keyJson: any;
  try {
    keyJson = JSON.parse(RAW_KEY);
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid service account JSON', detail: String(err?.message ?? err) }, { status: 500 });
  }

  const clientEmail = keyJson?.client_email ?? null;
  if (!clientEmail) {
    return NextResponse.json({ error: 'Service account JSON missing client_email' }, { status: 500 });
  }

  // dynamic import googleapis to avoid bundler issues if not installed in some environments
  let google: any;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await new Function('return import("googleapis")')();
    google = mod?.google;
    if (!google) throw new Error('googleapis module missing');
  } catch (err: any) {
    return NextResponse.json(
      { error: 'googleapis not available in runtime. Install googleapis or ensure dependency installed in deployment', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }

  const client = new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly'],
  });

  try {
    await client.authorize();
  } catch (err: any) {
    return NextResponse.json(
      { client_email: clientEmail, spreadsheetId: SPREADSHEET_ID, error: 'Service account auth failed', detail: String(err?.message ?? err) },
      { status: 403 },
    );
  }

  const sheets = google.sheets({ version: 'v4', auth: client });

  try {
    // Request minimal metadata (title + sheets titles) to see whether we can access the spreadsheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'properties.title,sheets.properties.title' });
    const titles = (meta.data.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
    return NextResponse.json({ client_email: clientEmail, spreadsheetId: SPREADSHEET_ID, spreadsheet_title: meta.data.properties?.title ?? null, sheet_tabs: titles }, { status: 200 });
  } catch (err: any) {
    // If Google returns an error object, surface it for debugging.
    const respData = err?.response?.data ?? null;
    return NextResponse.json(
      { client_email: clientEmail, spreadsheetId: SPREADSHEET_ID, error: 'Sheets API returned error', detail: respData ?? String(err?.message ?? err) },
      { status: err?.statusCode ?? 500 },
    );
  }
}
