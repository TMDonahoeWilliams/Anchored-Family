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

  // If it's already a string, try to tidy it
  if (typeof candidate === 'string') {
    let s = candidate.trim();

    // If string looks like url-encoded JSON, decode and parse
    if ((s.startsWith('%7B') && s.includes('%22')) || (s.startsWith('{') && s.includes('"access_token"'))) {
      try {
        const decoded = decodeURIComponent(s);
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token) return String(parsed.access_token);
      } catch (e) {}
    }

    // If it looks like JSON string (starts with "{" or contains "access_token"), try parse
    if ((s.startsWith('{') && s.includes('access_token')) || s.includes('"access_token"')) {
      try {
        const parsed = JSON.parse(s);
        if (parsed?.access_token) return String(parsed.access_token);
      } catch (e) {}
    }

    // If it is prefixed with "Bearer ", strip
    if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();

    // Remove surrounding quotes if present
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }

    return s || null;
  }

  // If candidate is object/array, try known shapes
  if (typeof candidate === 'object') {
    // common supabase session shapes:
    // { access_token: '...', ... } OR { session: { access_token: '...' } } OR { currentSession: { access_token: '...' } }
    if (candidate?.access_token) return String(candidate.access_token);
    if (candidate?.session?.access_token) return String(candidate.session.access_token);
    if (candidate?.currentSession?.access_token) return String(candidate.currentSession.access_token);
    if (candidate?.token) return String(candidate.token);
    // If there is a nested supabase session string
    try {
      const maybe = JSON.stringify(candidate);
      const parsed = JSON.parse(maybe);
      if (parsed?.access_token) return String(parsed.access_token);
    } catch (e) {}
  }

  return null;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const res = NextResponse.json(null, { status: 204 });
  const headers = makeCorsHeaders(origin);
  headers.forEach((v, k) => res.headers.set(k, v));
  console.log('[set-server-session] OPTIONS preflight from origin=', origin);
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin') ?? null;
    // debug log incoming headers
    console.log('[set-server-session] incoming POST headers:', JSON.stringify(Object.fromEntries(request.headers.entries())));

    const body = await request.json().catch(() => ({}));
    // client may pass { access_token: '...' } or the whole session object in various shapes
    let tokenCandidate = body?.access_token ?? body?.token ?? body?.session ?? body ?? null;

    // Try to extract from URLSearchParams-style post (just in case)
    if (!tokenCandidate && typeof body === 'string') {
      try {
        tokenCandidate = JSON.parse(body);
      } catch (e) {
        tokenCandidate = body;
      }
    }

    const token = tryExtractToken(tokenCandidate);

    if (!token) {
      console.log('[set-server-session] no token found in payload', JSON.stringify(body).slice(0, 400));
      const bad = NextResponse.json({ error: 'No access_token found in request body' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    // Basic validation: JWT should have 3 segments separated by '.'
    const segments = String(token).split('.');
    if (segments.length !== 3) {
      console.log('[set-server-session] token does not look like JWT, rejecting. preview=', mask(String(token)));
      const bad = NextResponse.json({ error: 'Provided token is not a valid JWT (malformed)' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    // Set cookie
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

    // set CORS headers (allow credentials)
    makeCorsHeaders(origin).forEach((v, k) => res.headers.set(k, v));

    console.log('[set-server-session] cookie set, tokenPreview=', mask(token), 'domain=', cookieDomain ?? '(host-only)', 'maxAge=', Math.floor(expiresIn));
    return res;
  } catch (err: any) {
    console.error('[set-server-session] error', err);
    const errRes = NextResponse.json({ error: 'internal server error' }, { status: 500 });
    makeCorsHeaders(request.headers.get('origin')).forEach((v, k) => errRes.headers.set(k, v));
    return errRes;
  }
}
