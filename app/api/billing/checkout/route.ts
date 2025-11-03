import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripeServer';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * Improved Checkout route
 *
 * - Resolves plan -> price id via:
 *   1) explicit price_id in body
 *   2) lookup_key in body (queries Stripe)
 *   3) server env map for named plans (STRIPE_PRICE_ID_BASIC / PLUS / PREMIUM)
 * - Validates the resolved price is active and recurring (Stripe subscription price)
 * - Supports providing stripe_customer_id or customer_email to reuse/create a Stripe Customer
 * - Uses idempotency key header (x-idempotency-key) if provided
 * - Builds success_url and cancel_url correctly (success_url contains {CHECKOUT_SESSION_ID} placeholder)
 * - Returns helpful debug output when x-debug header === '1'
 * - Returns clear errors when configuration is missing (e.g. missing price ids)
 *
 * Notes:
 * - Ensure STRIPE_PRICE_ID_BASIC / STRIPE_PRICE_ID_PLUS / STRIPE_PRICE_ID_PREMIUM are set in env for plan mapping.
 * - Ensure STRIPE_SECRET_KEY is set and getStripeInstance() returns a configured Stripe client.
 * - Ensure a webhook exists to upsert subscriptions into your DB (subscriptions table) so the UI can reflect Stripe state.
 */

function corsHeaders(origin?: string) {
  const allowedOrigin = origin || process.env.NEXT_PUBLIC_SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, X-Debug',
    // If you need cookies cross-origin, add:
    // 'Access-Control-Allow-Credentials': 'true'
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
    const stripe = getStripeInstance();
    if (!stripe) {
      const msg = 'Stripe not configured (missing STRIPE_SECRET_KEY)';
      console.error(msg);
      return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders() });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const body =
      contentType.includes('application/json')
        ? await request.json().catch(() => ({}))
        : Object.fromEntries(await request.formData().catch(() => new Map()));

    // Accept plan names: basic | plus | premium OR explicit price_id / lookup_key
    const plan = (body?.plan as string | undefined)?.toLowerCase();
    let priceId = (body?.price_id ?? body?.priceId) as string | undefined;
    const lookupKey = (body?.lookup_key ?? body?.lookupKey) as string | undefined;
    const orgId = body?.orgId;
    const userId = body?.userId;
    const successPath = body?.successPath as string | undefined;
    const cancelPath = body?.cancelPath as string | undefined;
    const stripeCustomerId = body?.stripe_customer_id as string | undefined;
    const customerEmail = body?.customer_email as string | undefined;

    // Map plan -> env price IDs (server must configure these)
    if (!priceId && plan) {
      const map: Record<string, string | undefined> = {
        basic: process.env.STRIPE_PRICE_ID_BASIC,
        plus: process.env.STRIPE_PRICE_ID_PLUS,
        premium: process.env.STRIPE_PRICE_ID_PREMIUM,
      };
      priceId = map[plan];
      if (!priceId) {
        // If plan === 'basic' treat as free (no checkout needed)
        if (plan === 'basic') {
          return NextResponse.json({ error: 'Basic (free) plan does not require checkout' }, { status: 400, headers: corsHeaders() });
        }
        const errMsg = `Price ID for plan "${plan}" is not configured. Set STRIPE_PRICE_ID_${(plan || '').toUpperCase()} in environment variables.`;
        console.error(errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500, headers: corsHeaders() });
      }
    }

    if (!priceId && !lookupKey) {
      return NextResponse.json({ error: 'Price ID or lookup key is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve lookupKey -> priceId via Stripe if necessary
    let resolvedPrice: any = null;
    let finalPriceId = priceId;
    if (lookupKey && !finalPriceId) {
      try {
        const prices = await stripe.prices.list({ lookup_keys: [lookupKey], expand: ['data.product'], limit: 1 });
        if (!prices || !prices.data || prices.data.length === 0) {
          const errMsg = `Price not found for lookup key "${lookupKey}"`;
          console.error('[/api/billing/checkout] ' + errMsg);
          return NextResponse.json({ error: errMsg }, { status: 404, headers: corsHeaders() });
        }
        resolvedPrice = prices.data[0];
        finalPriceId = resolvedPrice.id;
      } catch (e: any) {
        console.error('Error looking up price by lookup_key:', e);
        if (debug) return NextResponse.json({ error: String(e) }, { status: 500, headers: corsHeaders() });
        return NextResponse.json({ error: 'Price lookup failed' }, { status: 500, headers: corsHeaders() });
      }
    }

    // Ensure we have a final price id
    if (!finalPriceId) {
      const msg = `Unable to resolve price for checkout. Received plan="${plan}", priceId="${priceId}", lookupKey="${lookupKey}".`;
      console.error('[/api/billing/checkout] ' + msg);
      return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders() });
    }

    // Retrieve price to validate it's recurring and active
    try {
      if (!resolvedPrice) {
        resolvedPrice = await stripe.prices.retrieve(finalPriceId);
      }
      console.log('[/api/billing/checkout] resolvedPrice:', {
        id: resolvedPrice.id,
        recurring: resolvedPrice.recurring ?? null,
        active: resolvedPrice.active ?? null,
      });
    } catch (e: any) {
      console.error('Failed to retrieve price for validation', e);
      if (debug) return NextResponse.json({ error: String(e) }, { status: 400, headers: corsHeaders() });
      return NextResponse.json({ error: 'Invalid price id provided' }, { status: 400, headers: corsHeaders() });
    }

    if (!resolvedPrice.recurring) {
      const msg = 'Price is not recurring. Subscriptions require recurring prices.';
      console.error('[/api/billing/checkout] ' + msg);
      return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders() });
    }
    if (resolvedPrice.active === false) {
      const msg = 'Price is not active.';
      console.error('[/api/billing/checkout] ' + msg);
      return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders() });
    }

    // Determine origin for redirect URLs
    const origin = request.headers.get('origin') || (request.nextUrl && (request.nextUrl as any).origin) || process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) {
      const msg = 'Origin not available';
      console.error(msg);
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: corsHeaders() });
    }

    // Build success and cancel URLs.
    // success_url must include the placeholder {CHECKOUT_SESSION_ID} so Stripe will replace it.
    const buildSuccessUrl = (path?: string) => {
      const pathOrDefault = path ?? '/home';
      const url = new URL(pathOrDefault, origin);
      // place session id placeholder in query param
      url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
      return url.toString();
    };
    const buildCancelUrl = (path?: string) => {
      const pathOrDefault = path ?? '/account/settings/subscription?canceled=true';
      const url = new URL(pathOrDefault, origin);
      return url.toString();
    };

    const success_url = buildSuccessUrl(successPath);
    const cancel_url = buildCancelUrl(cancelPath);

    // Support idempotency via header or generate one
    const idempotencyKey = request.headers.get('x-idempotency-key') || `ck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Customer handling: prefer provided stripe_customer_id, otherwise try to reuse by email (best-effort)
    let customerToUse: string | undefined = stripeCustomerId;
    if (!customerToUse && customerEmail) {
      // Try to find existing customer by email (best-effort)
      try {
        const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
        if (customers.data.length > 0) customerToUse = customers.data[0].id;
      } catch (e) {
        console.warn('[billing/checkout] customers.list by email failed (non-fatal):', e);
      }
    }

    if (!customerToUse && customerEmail) {
      // Create a customer if we have an email and didn't find one
      try {
        const cust = await stripe.customers.create({
          email: customerEmail,
          metadata: { user_id: userId ?? '', org_id: orgId ?? '' },
        });
        customerToUse = cust.id;
        // TODO: persist mapping stripe_customer_id -> userId in DB (stripe_customers table)
      } catch (e: any) {
        console.warn('[billing/checkout] failed to create customer (non-fatal):', e);
      }
    }

    // Create Checkout session
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: finalPriceId, quantity: 1 }],
        success_url,
        cancel_url,
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        // include customer if available so checkout reuses the customer
        ...(customerToUse ? { customer: customerToUse } : {}),
        client_reference_id: userId ?? undefined,
        metadata: { source: 'anchored_family_app', orgId: orgId ?? '', userId: userId ?? '' },
        subscription_data: { metadata: { source: 'anchored_family_app', orgId: orgId ?? '', userId: userId ?? '' } },
        allow_promotion_codes: true,
      },
      { idempotencyKey }
    );

    console.log('[/api/billing/checkout] Stripe session created:', { id: session.id, url: session.url, customer: session.customer });

    if (!session || !session.url) {
      console.error('Stripe session missing url or session object:', session);
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500, headers: corsHeaders() });
    }

    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200, headers: corsHeaders(request.headers.get('origin') || undefined) });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    const debug = request.headers.get('x-debug') === '1';
    if (debug) {
      return NextResponse.json({ error: String(err) }, { status: 500, headers: corsHeaders() });
    }
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500, headers: corsHeaders() });
  }
}

