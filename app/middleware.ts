import { NextRequest, NextResponse } from 'next/server';

// Paths to skip auth
const PUBLIC_FILE_PREFIXES = [
  '/_next/',   // next internals
  '/static/',  // static (if used)
  '/images/',  // your /public/images
  '/favicon.ico',
  '/api/webhooks', // allow webhooks through
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass static assets, webhooks, and Next internals
  for (const p of PUBLIC_FILE_PREFIXES) {
    if (pathname.startsWith(p)) return NextResponse.next();
  }

  // Example: allow public home page (adjust to your public routes)
  if (pathname === '/' || pathname.startsWith('/public')) return NextResponse.next();

  // Your normal auth check (example)
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
  // or check cookie: req.cookies.get('sb:token') etc.

  if (!token) {
    // return 401 or redirect to sign-in, whichever your app uses
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Continue to app if token exists
  return NextResponse.next();
}

// Optionally limit what paths the middleware runs for (Next 13+)
export const config = {
  // run middleware only on paths you want to protect:
  matcher: ['/account/:path*', '/dashboard/:path*', '/api/protected/:path*'],
};
