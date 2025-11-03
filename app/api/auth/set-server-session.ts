import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function mask(s?: string | null) {
  if (!s) return null;
  if (s.length <= 10) return '******';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function makeCorsHeaders(origin: string | null) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin ?? '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return headers;
}

function tryExtractToken(candidate: any): string | null {
  if (!candidate) return null;

  if (typeof candidate === 'string') {
    let s = candidate.trim();
    // Accept "Bearer <token>"
    if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();
    // Remove surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    // If it is url-encoded JSON or JSON string, try to parse and extract access_token
    try {
      if ((s.startsWith('%7B') && s.includes('%22access_token%22')) || (s.startsWith('{') && s.includes('"access_token"'))) {
        const decoded = decodeURIComponent(s);
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token) return String(parsed.access_token);
      }
    } catch (e) {}
    try {
      if ((s.startsWith('{') && s.includes('access_token')) || s.includes('"access_token"')) {
        const parsed = JSON.parse(s);
        if (parsed?.access_token) return String(parsed.access_token);
      }
    } catch (e) {}
    return s || null;
  }

  if (typeof candidate === 'object') {
    if (candidate?.access_token) return String(candidate.access_token);
    if (candidate?.session?.access_token) return String(candidate.session.access_token);
    if (candidate?.currentSession?.access_token) return String(candidate.currentSession.access_token);
    if (candidate?.token) return String(candidate.token);
    return null;
  }

  return null;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const res = NextResponse.json(null, { status: 204 });
  makeCorsHeaders(origin).forEach((v, k) => res.headers.set(k, v));
  console.log('[set-server-session] OPTIONS preflight origin=', origin);
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin') ?? null;
    console.log('[set-server-session] incoming headers:', JSON.stringify(Object.fromEntries(request.headers.entries())));

    const body = await request.json().catch(() => ({}));
    // The client might send { access_token: '...' } or a whole session object or just the token string
    let tokenCandidate = body?.access_token ?? body?.token ?? body?.session ?? body ?? null;
    if (!tokenCandidate && typeof body === 'string') {
      // body might be a raw string
      tokenCandidate = body;
    }

    const token = tryExtractToken(tokenCandidate);
    if (!token) {
      console.log('[set-server-session] no token found in payload (preview):', JSON.stringify(body).slice(0, 400));
      const bad = NextResponse.json({ error: 'No access_token found in request body' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    // Validate simple JWT shape (3 segments)
    const parts = String(token).split('.');
    if (parts.length !== 3) {
      console.log('[set-server-session] token malformed preview=', mask(String(token)));
      const bad = NextResponse.json({ error: 'Provided token is not a valid JWT (malformed)' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    // set cookie
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g. ".anchoredfamily.com"
    const expiresIn = Number(body?.expires_in ?? 60 * 60 * 24 * 14);
    const res = NextResponse.json({ ok: true }, { status: 200 });

    res.cookies.set({
      name: 'sb:token',
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(expiresIn),
      domain: cookieDomain,
    });

    makeCorsHeaders(origin).forEach((v, k) => res.headers.set(k, v));
    console.log('[set-server-session] cookie set tokenPreview=', mask(token), 'domain=', cookieDomain ?? '(host-only)');
    return res;
  } catch (err: any) {
    console.error('[set-server-session] error', err);
    const errRes = NextResponse.json({ error: 'internal server error' }, { status: 500 });
    makeCorsHeaders(request.headers.get('origin')).forEach((v, k) => errRes.headers.set(k, v));
    return errRes;
  }
}
