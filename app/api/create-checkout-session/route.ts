import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    // Get Stripe instance (getStripeInstance should throw or return null if misconfigured)
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe instance not available - check STRIPE_SECRET_KEY');
      return NextResponse.json(
        { error: 'Payment provider not configured' },
        { status: 500 }
      );
    }

    // Determine content type and parse body robustly (support JSON and form-data)
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let priceId: string | undefined;
    let lookupKey: string | undefined;

    if (contentType.includes('application/json')) {
      // parse JSON body
      const jsonBody = await request.json().catch(() => null);
      priceId = jsonBody?.price_id ?? jsonBody?.priceId;
      lookupKey = jsonBody?.lookup_key ?? jsonBody?.lookupKey;
    } else {
      // fallback to formData for form submissions
      const form = await request.formData().catch(() => null);
      priceId = form?.get('price_id')?.toString();
      lookupKey = form?.get('lookup_key')?.toString();
    }

    // Validate inputs
    if (!priceId && !lookupKey) {
      return NextResponse.json(
        { error: 'Price ID or lookup key is required' },
        { status: 400 }
      );
    }

    // Guard against a sentinel "not_configured" value
    if (priceId && priceId.includes('not_configured')) {
      return NextResponse.json(
        {
          error:
            'Stripe prices are not configured. Please set up your products in the Stripe Dashboard and update STRIPE_PRICE_ID_* environment variables.',
        },
        { status: 500 }
      );
    }

    // Resolve origin for redirect URLs
    const origin =
      request.headers.get('origin') ??
      // NextRequest has nextUrl with origin in modern Next.js versions
      (request.nextUrl && (request.nextUrl as any).origin) ??
      process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      console.error('Origin not available for building redirect URLs');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // If using lookup key, retrieve price from Stripe
    let finalPriceId = priceId;
    let resolvedPrice: any = null;
    if (lookupKey && !priceId) {
      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        expand: ['data.product'],
        limit: 1,
      });

      if (!prices || !prices.data || prices.data.length === 0) {
        return NextResponse.json(
          { error: 'Price not found for lookup key' },
          { status: 404 }
        );
      }

      resolvedPrice = prices.data[0];
      finalPriceId = resolvedPrice.id;
    }

    // Ensure we have a final price id before calling Stripe
    if (!finalPriceId) {
      return NextResponse.json(
        { error: 'Unable to resolve price for checkout' },
        { status: 400 }
      );
    }

    // If this is a subscription, validate the price is recurring (Stripe requires recurring prices for subscription mode)
    if (!resolvedPrice && priceId) {
      // attempt to fetch the single price to validate recurring
      try {
        resolvedPrice = await stripe.prices.retrieve(finalPriceId);
      } catch (err) {
        console.error('Failed to retrieve price from Stripe for validation', err);
        // proceed — Stripe will also error on create if invalid — but return a helpful message
        return NextResponse.json(
          { error: 'Invalid price id provided' },
          { status: 400 }
        );
      }
    }

    if (resolvedPrice && !resolvedPrice.recurring) {
      return NextResponse.json(
        { error: 'Price is not a recurring price. Subscriptions must use a recurring price.' },
        { status: 400 }
      );
    }

    // Build Checkout Session payload (avoid unsupported params)
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/account/settings/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/settings/subscription?canceled=true`,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_creation: 'always',
      metadata: {
        source: 'anchored_family_app',
      },
      subscription_data: {
        metadata: {
          source: 'anchored_family_app',
        },
      },
    });

    if (!session || !session.url) {
      console.error('Stripe session created but no session URL returned', session);
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    // Return the Checkout URL
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    // Log full error server-side, but return a safe message to the client
    console.error('Error creating checkout session:', err);
    return NextResponse.json(
      { error: 'Unable to create checkout session' },
      { status: 500 }
    );
  }
}
