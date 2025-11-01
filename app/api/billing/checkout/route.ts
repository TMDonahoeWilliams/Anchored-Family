import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe'; // adjust if path differs

// Ensure Node runtime (if you rely on the Stripe Node SDK — remove or change if you need Edge)
export const runtime = 'nodejs';

function corsHeaders(origin?: string) {
  const allowedOrigin = origin || process.env.NEXT_PUBLIC_SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(request: NextRequest) {
  // Respond to preflight with 204 and CORS headers
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || undefined),
  });
}

export async function POST(request: NextRequest) {
  try {
    // Log incoming request method/path for debugging in production logs
    console.log('[/api/billing/checkout] POST request');

    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not configured');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500, headers: corsHeaders() });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await request.json().catch(() => null);
    } else {
      // form-data fallback
      const fd = await request.formData().catch(() => null);
      payload = fd ? Object.fromEntries(fd.entries()) : null;
    }

    const { plan, orgId, userId } = payload || {};
    if (!plan || !orgId || !userId) {
      return NextResponse.json({ error: 'Missing required fields: plan, orgId, userId' }, { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) });
    }

    // TODO: replace with your real Stripe Checkout creation logic
    // Example: call stripe.checkout.sessions.create(...) and return session.url
    // For now return a placeholder so callers can test.
    const session = {
      id: 'cs_test_example',
      url: 'https://example.com/stripe-checkout',
    };

    return NextResponse.json(
      { url: session.url, session_id: session.id },
      { status: 200, headers: corsHeaders(request.headers.get('origin') || undefined) }
    );
  } catch (err) {
    console.error('/api/billing/checkout POST error', err);
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500, headers: corsHeaders() });
  }
}

// Return JSON for any other method to prevent empty 405 bodies
export function GET(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
export function PUT(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
export function DELETE(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
