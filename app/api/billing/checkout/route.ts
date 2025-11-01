import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

// Ensure Node runtime if you rely on Stripe Node SDK
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

    // Parse body (JSON or form-data)
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const body = contentType.includes('application/json')
      ? await request.json().catch(() => null)
      : Object.fromEntries(await request.formData().catch(() => new Map()));

    const plan = body?.plan as string | undefined; // e.g. 'pro' | 'premium'
    let priceId = (body?.price_id ?? body?.priceId) as string | undefined;
    const lookupKey = (body?.lookup_key ?? body?.lookupKey) as string | undefined;
    const orgId = body?.orgId;
    const userId = body?.userId;
    const successPath = body?.successPath;
    const cancelPath = body?.cancelPath;

    // If client provided a plan but not a priceId, map plan -> priceId from env
    if (!priceId && plan) {
      const priceMap: Record<string, string | undefined> = {
        pro: process.env.STRIPE_PRICE_ID_BASIC,
        premium: process.env.STRIPE_PRICE_ID_PLUS,
        enterprise: process.env.STRIPE_PRICE_ID_PREMIUM,
      };
      priceId = priceMap[plan];
      if (!priceId) {
        // helpful error telling which env var to set
        return NextResponse.json(
          { error: `Price ID for plan "${plan}" is not configured. Set STRIPE_PRICE_ID_${plan.toUpperCase()} in environment.` },
          { status: 500 }
        );
      }
    }

    // Now require either priceId or lookupKey
    if (!priceId && !lookupKey) {
      return NextResponse.json({ error: 'Price ID or lookup key is required' }, { status: 400 });
    }

    // Guard against sentinel placeholders
    if (priceId && priceId.includes('not_configured')) {
      return NextResponse.json({
        error:
          'Stripe prices are not configured. Please set up products in the Stripe Dashboard and update STRIPE_PRICE_ID_* environment variables.',
      }, { status: 500 });
    }

    // Resolve origin for redirect URLs
    const origin = request.headers.get('origin') || (request.nextUrl && (request.nextUrl as any).origin) || process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      console.error('Origin not available to build redirect URLs.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Resolve finalPriceId (from priceId or lookupKey)
    let finalPriceId = priceId;
    let resolvedPrice: any = null;
    if (lookupKey && !priceId) {
      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        expand: ['data.product'],
        limit: 1,
      });
      if (!prices || !prices.data || prices.data.length === 0) {
        return NextResponse.json({ error: 'Price not found for lookup key' }, { status: 404 });
      }
      resolvedPrice = prices.data[0];
      finalPriceId = resolvedPrice.id;
    }

    if (!finalPriceId) {
      return NextResponse.json({ error: 'Unable to resolve price for checkout' }, { status: 400 });
    }

    // Validate recurring for subscription mode
    if (!resolvedPrice) {
      try {
        resolvedPrice = await stripe.prices.retrieve(finalPriceId);
      } catch (e) {
        console.error('Failed to retrieve price for validation', e);
        return NextResponse.json({ error: 'Invalid price id provided' }, { status: 400 });
      }
    }
    if (resolvedPrice && !resolvedPrice.recurring) {
      return NextResponse.json({ error: 'Price is not a recurring price. Subscriptions require recurring prices.' }, { status: 400 });
    }

    // Build URLs and create session
    const successUrl = `${origin}${successPath ?? '/account/settings/subscription/success'}`;
    const cancelUrl = `${origin}${cancelPath ?? '/account/settings/subscription?canceled=true'}`;

    const idempotencyKey = request.headers.get('x-idempotency-key') || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const session = await stripe.checkout.sessions.create({
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
    }, { idempotencyKey });

    if (!session || !session.url) {
      console.error('Stripe session missing or missing url:', session);
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200 });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: process.env.NODE_ENV !== 'production' ? String(err) : 'Unable to create checkout session' }, { status: 500 });
  }
}

