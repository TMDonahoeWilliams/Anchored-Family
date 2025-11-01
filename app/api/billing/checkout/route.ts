import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

// Ensure Node runtime (Stripe Node SDK requires Node)
export const runtime = 'nodejs';

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
    console.log('[/api/billing/checkout] POST invoked');

    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not configured (missing secret key)');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500, headers: corsHeaders() });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await request.json().catch(() => null);
    } else {
      const fd = await request.formData().catch(() => null);
      payload = fd ? Object.fromEntries(fd.entries()) : null;
    }

    const { plan, orgId, userId, successPath, cancelPath } = payload || {};
    if (!plan || !orgId || !userId) {
      return NextResponse.json({ error: 'Missing required fields: plan, orgId, userId' }, { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) });
    }

    // Map plan keys to Stripe price IDs (set the env vars in production)
    const priceMap: Record<string, string | undefined> = {
      pro: process.env.STRIPE_PRICE_ID_PRO,
      enterprise: process.env.STRIPE_PRICE_ID_ENTERPRISE,
      premium: process.env.STRIPE_PRICE_ID_PREMIUM, // if you use premium
    };

    const priceId = priceMap[plan];
    if (!priceId) {
      console.error('Price ID not configured for plan:', plan);
      return NextResponse.json({ error: 'Requested plan is not available' }, { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) });
    }

    // Build URLs
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      console.error('No origin available to build redirect URLs');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: corsHeaders() });
    }
    const successUrl = `${origin}${successPath || '/dashboard'}`;
    const cancelUrl = `${origin}${cancelPath || '/settings/billing?canceled=1'}`;

    // Create idempotency key to protect double requests (optional: allow client to send X-Idempotency-Key)
    const idempotencyKey = request.headers.get('x-idempotency-key') || (globalThis.crypto && (globalThis.crypto as any).randomUUID ? (globalThis.crypto as any).randomUUID() : String(Date.now()));

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_creation: 'always',
      metadata: { source: 'anchored_family_app', orgId, userId },
      subscription_data: { metadata: { source: 'anchored_family_app', orgId, userId } },
    }, {
      idempotencyKey,
    });

    if (!session || !session.url) {
      console.error('Stripe returned invalid session:', session);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) });
    }

    // Success
    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200, headers: corsHeaders(request.headers.get('origin') || undefined) });
  } catch (err: any) {
    // Log full stripe error (important for debugging). In production send a safe message to client.
    console.error('[/api/billing/checkout] error:', err);
    // If Stripe error object has useful info surface it to logs: err.message, err.type, err.raw
    const devMsg = process.env.NODE_ENV !== 'production' ? (err?.message || String(err)) : undefined;
    return NextResponse.json({ error: devMsg || 'Unable to create checkout session' }, { status: 500, headers: corsHeaders() });
  }
}

// Respond JSON for any other method to prevent empty 405 bodies
export function GET() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders() }); }
export function PUT() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders() }); }
export function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders() }); }
