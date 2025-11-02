// app/middleware.ts (example)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const protectedPaths = ['/budget', '/dashboard/family-budget', '/dashboard/budget']; // adjust
  if (protectedPaths.some(p => pathname.startsWith(p))) {
    const token = request.cookies.get('session')?.value; // or your cookie name
    if (!token) {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}
