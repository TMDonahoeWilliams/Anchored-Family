import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Robust app-route handler for setting a server HttpOnly cookie (sb:token).
 * - Handles OPTIONS (preflight) with CORS headers.
 * - Handles POST { access_token, expires_in? } and sets sb:token cookie.
 * - Adds Access-Control-Allow-Credentials so fetch(..., credentials: 'include') works.
 *
 * IMPORTANT:
 * - Set COOKIE_DOMAIN=".anchoredfamily.com" in Vercel if you want cookie valid for apex + www.
 * - This route includes console.log statements so you can inspect Vercel function logs.
 */

function makeCorsHeaders(origin: string | null) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin ?? '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  // Allow credentials if client sends them (necessary for cookies with cross-origin)
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return headers;
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
    const origin = request.headers.get('origin');
    // Log headers and method for debugging in Vercel logs
    console.log('[set-server-session] incoming POST, origin=', origin, ' headers=', JSON.stringify(Object.fromEntries(request.headers.entries())));

    const body = await request.json().catch(() => ({}));
    const accessToken = body?.access_token;
    const expiresIn = Number(body?.expires_in ?? 60 * 60 * 24 * 14);

    if (!accessToken || typeof accessToken !== 'string') {
      console.log('[set-server-session] missing access_token in POST body');
      const bad = NextResponse.json({ error: 'access_token is required' }, { status: 400 });
      makeCorsHeaders(origin).forEach((v, k) => bad.headers.set(k, v));
      return bad;
    }

    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g. ".anchoredfamily.com"
    const res = NextResponse.json({ ok: true }, { status: 200 });

    res.cookies.set({
      name: 'sb:token',
      value: accessToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(expiresIn),
      domain: cookieDomain,
    });

    // Set CORS headers (and allow credentials)
    makeCorsHeaders(origin).forEach((v, k) => res.headers.set(k, v));

    console.log('[set-server-session] set cookie domain=', cookieDomain ? cookieDomain : '(host-only)', ' maxAge=', Math.floor(expiresIn));
    return res;
  } catch (err: any) {
    console.error('[set-server-session] error', err);
    const errRes = NextResponse.json({ error: 'internal error' }, { status: 500 });
    makeCorsHeaders(request.headers.get('origin')).forEach((v, k) => errRes.headers.set(k, v));
    return errRes;
  }
}
