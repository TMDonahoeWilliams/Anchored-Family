import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

// If you use the Stripe Node SDK, ensure the route runs on Node.
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
      return NextResponse.json(
        { error: 'Payment provider not configured' },
        { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await request.json().catch(() => null);
    } else {
      const fd = await request.formData().catch(() => null);
      payload = fd ? Object.fromEntries(fd.entries()) : null;
    }

    // Accept price_id or lookup_key from client
    const priceFromBody = (payload?.price_id ?? payload?.priceId) as string | undefined;
    const lookupKey = (payload?.lookup_key ?? payload?.lookupKey) as string | undefined;
    const orgId = payload?.orgId;
    const userId = payload?.userId;
    const successPath = payload?.successPath;
    const cancelPath = payload?.cancelPath;

    if (!priceFromBody && !lookupKey) {
      return NextResponse.json(
        { error: 'Price ID or lookup key is required' },
        { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    if (priceFromBody && priceFromBody.includes('not_configured')) {
      return NextResponse.json(
        {
          error:
            'Stripe prices are not configured. Please set up products in the Stripe Dashboard and update STRIPE_PRICE_ID_* environment variables.',
        },
        { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    // Build origin
    const origin =
      request.headers.get('origin') ||
      (request.nextUrl && (request.nextUrl as any).origin) ||
      process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      console.error('Origin not available to build redirect URLs.');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    // Resolve finalPriceId (from price or lookup key)
    let finalPriceId = priceFromBody;
    let resolvedPrice: any = null;
    if (lookupKey && !finalPriceId) {
      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        expand: ['data.product'],
        limit: 1,
      });

      if (!prices || !prices.data || prices.data.length === 0) {
        return NextResponse.json(
          { error: 'Price not found for lookup key' },
          { status: 404, headers: corsHeaders(request.headers.get('origin') || undefined) }
        );
      }

      resolvedPrice = prices.data[0];
      finalPriceId = resolvedPrice.id;
    }

    if (!finalPriceId) {
      return NextResponse.json(
        { error: 'Unable to resolve price for checkout' },
        { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    // Validate recurring for subscription mode
    if (!resolvedPrice) {
      try {
        resolvedPrice = await stripe.prices.retrieve(finalPriceId);
      } catch (e) {
        console.error('Failed to retrieve price for validation', e);
        return NextResponse.json(
          { error: 'Invalid price id provided' },
          { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) }
        );
      }
    }
    if (resolvedPrice && !resolvedPrice.recurring) {
      return NextResponse.json(
        { error: 'Price is not a recurring price. Subscriptions require recurring prices.' },
        { status: 400, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    const successUrl = `${origin}${successPath ?? '/account/settings/subscription/success'}`;
    const cancelUrl = `${origin}${cancelPath ?? '/account/settings/subscription?canceled=true'}`;

    // Idempotency key (allow client-provided header to override)
    const idempotencyKey =
      request.headers.get('x-idempotency-key') || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create(
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
      {
        idempotencyKey,
      }
    );

    // Write session to logs for debugging; ensure we return session.url to client
    console.log('Stripe session returned:', session);

    if (!session || !session.url) {
      console.error('Stripe session missing url:', session);
      return NextResponse.json(
        { error: 'Failed to create checkout URL' },
        { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) }
      );
    }

    return NextResponse.json(
      { url: session.url, session_id: session.id },
      { status: 200, headers: corsHeaders(request.headers.get('origin') || undefined) }
    );
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    const devMsg = process.env.NODE_ENV !== 'production' ? (err?.message || String(err)) : undefined;
    return NextResponse.json(
      { error: devMsg || 'Unable to create checkout session' },
      { status: 500, headers: corsHeaders(request.headers.get('origin') || undefined) }
    );
  }
}

// Fallbacks to avoid empty 405 responses
export function GET(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
export function PUT(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
export function DELETE(request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) });
}
