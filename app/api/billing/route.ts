import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight proxy for POST /api/billing -> POST /api/billing/checkout
 * This allows existing callers to POST to /api/billing while the real
 * Checkout logic lives in /api/billing/checkout.
 *
 * It forwards the request body and Content-Type header and returns the
 * upstream response (status + body + Content-Type) to the client so the
 * client sees the same JSON the checkout route returns.
 *
 * Also handles OPTIONS preflight so CORS preflight won't return an empty 405.
 */

function corsHeaders(origin?: string) {
  const allowedOrigin = origin || process.env.NEXT_PUBLIC_SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || undefined),
  });
}

export async function POST(request: NextRequest) {
  try {
    // Read original request body as text so we can forward it.
    const bodyText = await request.text();

    // Determine the internal checkout endpoint URL relative to this request.
    // Using request.url as the base ensures correct origin and basePath.
    const checkoutUrl = new URL('/api/billing/checkout', request.url).toString();

    // Forward content-type if present
    const contentType = request.headers.get('content-type') || 'application/json';

    const forwarded = await fetch(checkoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        // Forward authorization header if present (useful if you protect the checkout route)
        ...(request.headers.get('authorization') ? { Authorization: request.headers.get('authorization')! } : {}),
        // Forward idempotency key if provided by client
        ...(request.headers.get('x-idempotency-key') ? { 'X-Idempotency-Key': request.headers.get('x-idempotency-key')! } : {}),
      },
      body: bodyText,
      // Ensure same-host fetch uses internal routing; don't set caching unless desired
    });

    // Read upstream response text
    const respText = await forwarded.text();

    // Build response headers (propagate Content-Type so client parsing is accurate)
    const respContentType = forwarded.headers.get('content-type') || 'application/json';
    const headers = {
      ...corsHeaders(request.headers.get('origin') || undefined),
      'Content-Type': respContentType,
    };

    // If upstream returned an empty body, return a JSON error object for clarity
    if (!respText) {
      // If upstream succeeded with 204/201 etc but empty body, return an empty JSON object for clients expecting JSON
      if (forwarded.status >= 200 && forwarded.status < 300) {
        return NextResponse.json({}, { status: forwarded.status, headers });
      }
      // Upstream returned an error with empty body — provide a helpful message
      return NextResponse.json(
        { error: 'Upstream checkout endpoint returned empty body' },
        { status: forwarded.status || 502, headers }
      );
    }

    // Return upstream body and status
    return new NextResponse(respText, { status: forwarded.status, headers });
  } catch (err: any) {
    console.error('Error proxying to /api/billing/checkout:', err);
    return NextResponse.json(
      { error: 'Unable to proxy to checkout endpoint' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
