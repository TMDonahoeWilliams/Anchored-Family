import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * App-router API route that handles:
 *  - OPTIONS: preflight (returns 204 with CORS headers)
 *  - POST: accepts { access_token, expires_in? } and sets sb:token HttpOnly cookie
 *
 * Ensure COOKIE_DOMAIN env var is set to ".anchoredfamily.com" if you want the cookie
 * valid on both apex and www hosts. If not set, the cookie will be host-only.
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const res = NextResponse.json(null, { status: 204 });
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Vary', 'Origin');
  // If you ever fetch with credentials from a different origin, also set:
  // res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = body?.access_token;
    const expiresIn = Number(body?.expires_in ?? 60 * 60 * 24 * 14); // seconds default 14d

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
    }

    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g. ".anchoredfamily.com"

    const res = NextResponse.json({ ok: true }, { status: 200 });

    // Set secure httpOnly cookie visible to server-side middleware/pages
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

    // Add Vary/Origin headers for safety (useful if CORS ever needed)
    const origin = request.headers.get('origin') ?? '';
    if (origin) {
      res.headers.set('Access-Control-Allow-Origin', origin);
      // If you fetch with credentials across origins, enable:
      // res.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return res;
  } catch (err: any) {
    console.error('[app/api/auth/set-server-session] error', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
