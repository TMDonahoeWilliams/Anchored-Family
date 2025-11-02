import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie names to check (add any other names your client uses)
const COOKIE_NAMES = [
  'sb:token',
  'sb-access-token',
  'supabase-auth-token',
  'supabase-auth',
  'sb-session',
  'session',
];

// Protect these prefixes (exact or prefix)
const PROTECTED_PREFIXES = ['/budget', '/dashboard/family-budget', '/dashboard/budget'];

function mask(s?: string | null) {
  if (!s) return null;
  if (s.length <= 8) return '******';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function extractTokenCandidate(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  for (const name of COOKIE_NAMES) {
    const c = request.cookies.get(name);
    if (!c) continue;
    // cookie.value may be JSON or a token; try simple heuristics:
    try {
      const parsed = JSON.parse(c.value);
      if (parsed?.access_token) return String(parsed.access_token);
      if (parsed?.currentSession?.access_token) return String(parsed.currentSession.access_token);
      if (parsed?.session?.access_token) return String(parsed.session.access_token);
      // fall through to return raw if nothing found
    } catch {}
    // if value looks like JWT (3 parts) or non-empty, return it
    if (c.value && c.value.split('.').length === 3) return c.value;
    if (c.value) return c.value;
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname, origin, search } = request.nextUrl;

  // allow static, api and assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/static') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Only guard the configured prefixes
  if (!PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Log host and cookie names server sees (mask values)
  try {
    const all = request.cookies.getAll().map(c => ({ name: c.name, preview: c.value ? mask(c.value) : null }));
    console.log('[middleware] host=', request.headers.get('host'), 'path=', pathname, 'cookies=', all);
  } catch (e) {
    console.log('[middleware] cookie list error', String(e));
  }

  // Look for token candidate in Authorization header or common cookies
  const tokenCandidate = extractTokenCandidate(request);
  console.log('[middleware] tokenCandidatePresent=', !!tokenCandidate, 'tokenPreview=', mask(tokenCandidate));

  if (!tokenCandidate) {
    // Build login URL with next param so user returns after signing in
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('next', pathname + (search || ''));
    console.log(`[middleware] redirecting to login, next=${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  }

  // Allow request to continue
  return NextResponse.next();
}

export const config = {
  matcher: ['/budget', '/dashboard/:path*'],
};
