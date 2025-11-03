import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripeServer';

export const runtime = 'nodejs';

function corsHeaders(origin?: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || undefined),
  });
}

/**
 * Create a billing portal session for a Stripe customer.
 * Accepts JSON or form-data with either { session_id } or { customer_id }.
 * If session_id is provided, the route retrieves the checkout session and extracts the customer id.
 * This version protects against stripe === null (missing STRIPE_SECRET_KEY) and returns a clear error.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') ?? undefined;
  const headers = corsHeaders(origin);

  try {
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('[create-portal-session] Stripe not configured (missing STRIPE_SECRET_KEY)');
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500, headers });
    }

    // Support JSON and form submissions
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let sessionId: string | null = null;
    let customerId: string | null = null;

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      sessionId = (body?.session_id as string | undefined) ?? null;
      customerId = (body?.customer_id as string | undefined) ?? null;
    } else {
      const form = await request.formData().catch(() => null);
      if (form) {
        sessionId = (form.get('session_id') as string | null) ?? null;
        customerId = (form.get('customer_id') as string | null) ?? null;
      }
    }

    if (!sessionId && !customerId) {
      return NextResponse.json({ error: 'Session ID or Customer ID is required' }, { status: 400, headers });
    }

    let finalCustomerId = customerId;

    if (sessionId && !finalCustomerId) {
      // stripe is guaranteed non-null above; use it to retrieve the checkout session safely
      let checkoutSession;
      try {
        checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] });
      } catch (err: any) {
        console.error('[create-portal-session] failed to retrieve checkout session', err);
        return NextResponse.json({ error: 'Unable to retrieve checkout session' }, { status: 400, headers });
      }

      const cust = (checkoutSession as any).customer;
      if (!cust) {
        return NextResponse.json({ error: 'No customer found for this session' }, { status: 404, headers });
      }
      finalCustomerId = typeof cust === 'string' ? cust : (cust?.id ?? null);
    }

    if (!finalCustomerId) {
      return NextResponse.json({ error: 'Unable to resolve a Stripe customer id' }, { status: 400, headers });
    }

    // OPTIONAL: add server-side authorization here to ensure finalCustomerId belongs to the authenticated user

    const returnUrl = origin ? new URL('/account/settings/subscription', origin).toString() : '/account/settings/subscription';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: finalCustomerId,
      return_url: returnUrl,
    });

    if (!portalSession?.url) {
      console.error('[create-portal-session] portal session created but no url returned', portalSession);
      return NextResponse.json({ error: 'Failed to create billing portal session' }, { status: 500, headers });
    }

    // If the request expects HTML, redirect; otherwise return JSON with URL
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/html')) {
      return NextResponse.redirect(portalSession.url, 303);
    }

    return NextResponse.json({ url: portalSession.url }, { status: 200, headers });
  } catch (err: any) {
    console.error('[create-portal-session] unexpected error', err);
    return NextResponse.json({ error: err?.message ?? 'An unexpected error occurred' }, { status: 500, headers });
  }
}
