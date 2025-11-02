import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Adjust cookieName to the name your auth uses (e.g. 'session', 'sb:token', 'next-auth.session-token')
const COOKIE_NAME = 'session'; // <-- replace with your cookie name

// Protect these paths (exact or prefix)
const PROTECTED_PREFIXES = ['/budget', '/dashboard/family-budget', '/dashboard/budget'];

export function middleware(request: NextRequest) {
  const { pathname, origin, search } = request.nextUrl;

  // Quick early allow for static/public paths
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Only guard configured prefixes
  if (!PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Read cookie presence and log a short preview (no secrets)
  const cookie = request.cookies.get(COOKIE_NAME);
  console.log(`[middleware] path=${pathname} cookiePresent=${!!cookie} cookiePreview=${cookie ? cookie.value.slice(0,8) : 'none'}`);

  if (!cookie) {
    // Build login URL with next param so user returns after signing in
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('next', pathname + (search || ''));
    console.log(`[middleware] redirecting to login, next=${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  }

  // If cookie present, allow request to continue
  return NextResponse.next();
}

// Only used in app router; you can export config if required
export const config = {
  matcher: ['/budget', '/dashboard/:path*'], // restrict middleware matching (optional)
};
