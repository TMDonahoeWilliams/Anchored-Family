import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

// Ensure Node runtime if you rely on the Stripe Node SDK
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
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not configured (missing secret key).');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const body = contentType.includes('application/json')
      ? await request.json().catch(() => null)
      : Object.fromEntries(await request.formData().catch(() => new Map()));

    // Example: resolve plan -> priceId here (omitted for brevity)
    const finalPriceId = body?.price_id ?? body?.priceId;
    const orgId = body?.orgId;
    const userId = body?.userId;
    const successPath = body?.successPath;
    const cancelPath = body?.cancelPath;

    const origin =
      request.headers.get('origin') ||
      (request.nextUrl && (request.nextUrl as any).origin) ||
      process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const successUrl = `${origin}${successPath ?? '/account/settings/subscription/success'}`;
    const cancelUrl = `${origin}${cancelPath ?? '/account/settings/subscription?canceled=true'}`;

    const idempotencyKey = request.headers.get('x-idempotency-key') || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // CREATE CHECKOUT SESSION (subscription mode) — removed `customer_creation`
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: finalPriceId, quantity: 1 }],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        // customer_creation: 'always', <-- removed for subscription mode
        metadata: { source: 'anchored_family_app', orgId, userId },
        subscription_data: { metadata: { source: 'anchored_family_app', orgId, userId } },
      },
      { idempotencyKey }
    );

    if (!session || !session.url) {
      console.error('Stripe session missing url:', session);
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200 });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: process.env.NODE_ENV !== 'production' ? String(err) : 'Unable to create checkout session' }, { status: 500 });
  }
}
