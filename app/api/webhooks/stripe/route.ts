import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripeServer';

export const runtime = 'nodejs';

function corsHeaders(origin?: string | null) {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', origin ?? '*');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}

function mask(s: string | null | undefined, showStart = 8, showEnd = 8) {
  if (!s) return '';
  if (s.length <= showStart + showEnd + 3) return '***';
  return `${s.slice(0, showStart)}...${s.slice(-showEnd)}`;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: Object.fromEntries(corsHeaders(req.headers.get('origin') || undefined).entries()),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') ?? undefined;
  const headers = Object.fromEntries(corsHeaders(origin).entries());

  const stripe = getStripeInstance();
  if (!stripe) {
    console.error('[webhook] Stripe not configured (missing STRIPE_SECRET_KEY)');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500, headers });
  }

  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500, headers });
  }

  // IMPORTANT: read raw body (do not parse JSON before verification)
  const payload = await req.text();
  // read stripe-signature header case-insensitively
  const sig = req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature');

  console.log('[webhook] incoming request — payloadLength=', payload.length, ' signaturePresent=', !!sig);

  if (!sig) {
    console.warn('[webhook] stripe-signature header missing');
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400, headers });
  }

  // Masked logging: don't log full secret or signature
  console.log('[webhook] signature header preview:', mask(sig));

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    // Common Stripe SDK messages: "No signatures found matching...", "Unable to extract signature from header", etc.
    console.error('[webhook] signature verification failed:', err?.message ?? err);
    // Optionally log a small payload preview for debugging (not full body)
    console.error('[webhook] payload preview:', payload.slice(0, 1000));
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message ?? String(err)}` }, { status: 400, headers });
  }

  // Verified: handle events
  try {
    console.log('[webhook] verified event type=', event.type);

    // Example handling — adapt to your schema and mapping logic:
    // - For checkout.session.completed: retrieve session, get subscription id, customer, metadata (user_id)
    // - For customer.subscription.* or invoice.*: upsert subscription row
    //
    // PSEUDO:
    // switch (event.type) {
    //   case 'checkout.session.completed': { ... upsert subscription ...; break; }
    //   case 'customer.subscription.updated': { ... upsert subscription ...; break; }
    //   ...
    // }

    return NextResponse.json({ received: true }, { status: 200, headers });
  } catch (err: any) {
    console.error('[webhook] error processing event:', err);
    return NextResponse.json({ error: 'Failed handling webhook' }, { status: 500, headers });
  }
}
