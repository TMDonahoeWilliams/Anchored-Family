import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not configured (missing secret key).');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    // Robust body parsing: support JSON and form-data
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let priceId: string | undefined;
    let lookupKey: string | undefined;

    if (contentType.includes('application/json')) {
      const json = await request.json().catch(() => null);
      priceId = json?.price_id ?? json?.priceId;
      lookupKey = json?.lookup_key ?? json?.lookupKey;
    } else {
      const form = await request.formData().catch(() => null);
      priceId = form?.get('price_id')?.toString();
      lookupKey = form?.get('lookup_key')?.toString();
    }

    if (!priceId && !lookupKey) {
      return NextResponse.json({ error: 'Price ID or lookup key is required' }, { status: 400 });
    }

    if (priceId && priceId.includes('not_configured')) {
      return NextResponse.json(
        {
          error:
            'Stripe prices are not configured. Please set up products in the Stripe Dashboard and update STRIPE_PRICE_ID_* environment variables.',
        },
        { status: 500 }
      );
    }

    // Resolve origin for success/cancel URLs
    const origin =
      request.headers.get('origin') ||
      (request.nextUrl && (request.nextUrl as any).origin) ||
      process.env.NEXT_PUBLIC_SITE_URL;
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
      return NextResponse.json(
        { error: 'Price is not a recurring price. Subscriptions require recurring prices.' },
        { status: 400 }
      );
    }

    // Create Checkout Session (keep parameters stable/compatible)
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: finalPriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/account/settings/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/settings/subscription?canceled=true`,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_creation: 'always',
      metadata: { source: 'anchored_family_app' },
      subscription_data: { metadata: { source: 'anchored_family_app' } },
    });

    if (!session) {
      console.error('Stripe returned no session object');
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    // session.url may be undefined in some situations — guard for it
    if (!session.url) {
      console.error('Stripe session created but no URL returned', session);
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500 });
    }

    // Success: always return JSON
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    // Log full internal error, but return safe JSON to client
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 });
  }
}
