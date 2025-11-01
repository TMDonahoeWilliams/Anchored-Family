import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

// Ensure Node runtime for Stripe Node SDK
export const runtime = 'nodejs';

function corsHeaders(origin?: string) {
  const allowedOrigin = origin || process.env.NEXT_PUBLIC_SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, X-Debug',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || undefined),
  });
}

export async function POST(request: NextRequest) {
  const debug = request.headers.get('x-debug') === '1';
  try {
    console.log('[/api/billing/checkout] POST invoked');

    const stripe = getStripeInstance();
    if (!stripe) {
      const msg = 'Stripe not configured (missing STRIPE_SECRET_KEY)';
      console.error(msg);
      return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders() });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const body = contentType.includes('application/json')
      ? await request.json().catch(() => null)
      : Object.fromEntries(await request.formData().catch(() => new Map()));

    // Accept plan names: basic | plus | premium OR explicit price_id / lookup_key
    const plan = body?.plan as string | undefined;
    let priceId = (body?.price_id ?? body?.priceId) as string | undefined;
    const lookupKey = (body?.lookup_key ?? body?.lookupKey) as string | undefined;
    const orgId = body?.orgId;
    const userId = body?.userId;
    const successPath = body?.successPath;
    const cancelPath = body?.cancelPath;

    // Map plan -> env price IDs (ensure env vars set in Vercel: STRIPE_PRICE_ID_BASIC, STRIPE_PRICE_ID_PLUS, STRIPE_PRICE_ID_PREMIUM)
    if (!priceId && plan) {
      const map: Record<string, string | undefined> = {
        basic: process.env.STRIPE_PRICE_ID_BASIC,
        plus: process.env.STRIPE_PRICE_ID_PLUS,
        premium: process.env.STRIPE_PRICE_ID_PREMIUM,
      };
      priceId = map[plan];
      if (!priceId) {
        const errMsg = `Price ID for plan "${plan}" is not configured. Set STRIPE_PRICE_ID_${plan.toUpperCase()} in Vercel environment variables.`;
        console.error(errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500, headers: corsHeaders() });
      }
    }

    if (!priceId && !lookupKey) {
      return NextResponse.json({ error: 'Price ID or lookup key is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve lookupKey -> price if necessary
    let finalPriceId = priceId;
    let resolvedPrice: any = null;
    if (lookupKey && !finalPriceId) {
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], expand: ['data.product'], limit: 1 });
      console.log('[/api/billing/checkout] prices.list:', prices);
      if (!prices || !prices.data || prices.data.length === 0) {
        return NextResponse.json({ error: 'Price not found for lookup key' }, { status: 404, headers: corsHeaders() });
      }
      resolvedPrice = prices.data[0];
      finalPriceId = resolvedPrice.id;
    }

    if (!finalPriceId) {
      return NextResponse.json({ error: 'Unable to resolve price for checkout' }, { status: 400, headers: corsHeaders() });
    }

    // Validate recurring (subscriptions require recurring prices)
    try {
      resolvedPrice = resolvedPrice ?? (await stripe.prices.retrieve(finalPriceId));
      console.log('[/api/billing/checkout] resolvedPrice:', { id: resolvedPrice.id, recurring: resolvedPrice.recurring ?? null });
    } catch (e) {
      console.error('Failed to retrieve price for validation', e);
      if (debug) return NextResponse.json({ error: String(e) }, { status: 400, headers: corsHeaders() });
      return NextResponse.json({ error: 'Invalid price id provided' }, { status: 400, headers: corsHeaders() });
    }

    if (resolvedPrice && !resolvedPrice.recurring) {
      return NextResponse.json({ error: 'Price is not recurring. Subscriptions require recurring prices.' }, { status: 400, headers: corsHeaders() });
    }

    const origin =
      request.headers.get('origin') || (request.nextUrl && (request.nextUrl as any).origin) || process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      console.error('Origin not available');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: corsHeaders() });
    }

    const successUrl = `${origin}${successPath ?? '/account/settings/subscription/success'}`;
    const cancelUrl = `${origin}${cancelPath ?? '/account/settings/subscription?canceled=true'}`;

    const idempotencyKey = request.headers.get('x-idempotency-key') || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create session and capture Stripe errors
    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'subscription',
          line_items: [{ price: finalPriceId, quantity: 1 }],
          success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          automatic_tax: { enabled: true },
          billing_address_collection: 'required',
          customer_creation: 'always',
          metadata: { source: 'anchored_family_app', orgId, userId },
          subscription_data: { metadata: { source: 'anchored_family_app', orgId, userId } },
        },
        { idempotencyKey }
      );
    } catch (stripeErr: any) {
      console.error('Stripe checkout.sessions.create error:', stripeErr);
      if (debug) return NextResponse.json({ error: String(stripeErr), stripeRaw: stripeErr }, { status: 500, headers: corsHeaders() });
      return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500, headers: corsHeaders() });
    }

    console.log('Stripe session returned:', session);
    if (!session || !session.url) {
      console.error('Stripe session missing url:', session);
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500, headers: corsHeaders() });
    }

    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200, headers: corsHeaders() });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    const debug = request.headers.get('x-debug') === '1';
    if (debug) {
      return NextResponse.json({ error: String(err) }, { status: 500, headers: corsHeaders() });
    }
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500, headers: corsHeaders() });
  }
}
