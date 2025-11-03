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
  // Allow credentials only when an explicit origin is provided
  if (origin) headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return headers;
}

// Strict JWT check: base64url.base64url.base64url
function looksLikeJwt(s: string) {
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(s);
}

function tryExtractToken(candidate: any): string | null {
  if (!candidate) return null;

  if (typeof candidate === 'string') {
    let s = candidate.trim();

    // If it's a quoted string, unquote
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }

    // Accept "Bearer <token>"
    if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();

    // If it looks like JWT, return it
    if (looksLikeJwt(s)) return s;

    // If string is JSON or url-encoded JSON try to parse and extract access_token
    try {
      const decoded = s.includes('%7B') ? decodeURIComponent(s) : s;
      if ((decoded.startsWith('{') && decoded.includes('access_token')) || decoded.includes('"access_token"')) {
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token && typeof parsed.access_token === 'string' && looksLikeJwt(parsed.access_token)) {
          return parsed.access_token;
        }
      }
    } catch (e) {
      // ignore parse errors
    }

    // otherwise do not return arbitrary strings (avoid storing non-JWT strings)
    return null;
  }

  if (typeof candidate === 'object') {
    // candidate may be a session object or other shapes
    const maybe =
      candidate?.access_token ??
      candidate?.session?.access_token ??
      candidate?.currentSession?.access_token ??
      candidate?.token ??
      null;
    if (maybe && typeof maybe === 'string' && looksLikeJwt(maybe)) return maybe;
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
    console.log('[set-server-session] incoming POST, origin=', origin);

    const body = await request.json().catch(() => ({}));
    // Support body being { access_token } or full session or raw string
    let tokenCandidate = body?.access_token ?? body?.token ?? body?.session ?? body ?? null;
    if (!tokenCandidate && typeof body === 'string') {
      tokenCandidate = body;
    }

    const token = tryExtractToken(tokenCandidate);
    if (!token) {
      console.warn('[set-server-session] no valid JWT access_token found in request payload (preview):', JSON.stringify(body).slice(0, 400));
      const bad = NextResponse.json({ error: 'No valid access_token (JWT) found in request body' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    // Set cookie options
    // NOTE: only set domain if explicitly configured; leave undefined for host-only cookies (preview deployments)
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g. ".anchoredfamily.com"
    const expiresIn = Number(body?.expires_in ?? 60 * 60 * 24 * 14);
    const res = NextResponse.json({ ok: true }, { status: 200 });

    res.cookies.set({
      name: 'sb:token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(expiresIn),
      domain: cookieDomain,
    });

    makeCorsHeaders(origin).forEach((v, k) => res.headers.set(k, v));
    // Mask preview only, do not log full token
    console.log('[set-server-session] cookie set tokenPreview=', mask(token), 'domain=', cookieDomain ?? '(host-only)');
    return res;
  } catch (err: any) {
    console.error('[set-server-session] error', err);
    const errRes = NextResponse.json({ error: 'internal server error' }, { status: 500 });
    makeCorsHeaders(request.headers.get('origin')).forEach((v, k) => errRes.headers.set(k, v));
    return errRes;
  }
}
