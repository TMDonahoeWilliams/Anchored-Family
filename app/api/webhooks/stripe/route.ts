import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripeServer';

export const runtime = 'nodejs';

// CORS helper
function corsHeaders(origin?: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin') || undefined) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') ?? undefined;
  const headers = corsHeaders(origin);

  const stripe = getStripeInstance();
  if (!stripe) {
    console.error('[webhook] Stripe not configured (missing STRIPE_SECRET_KEY)');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500, headers });
  }

  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500, headers });
  }

  // IMPORTANT: read raw body as text (do NOT parse JSON before verification)
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature');

  console.log('[webhook] incoming webhook — payload length:', payload.length, 'signature present:', !!sig);

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400, headers });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err?.message ?? err);
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message ?? err}` }, { status: 400, headers });
  }

  try {
    console.log('[webhook] verified event:', event.type);

    // Handle required events — extend with your DB upsert logic
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        console.log('[webhook] checkout.session.completed id=', session.id, 'customer=', session.customer);
        // TODO: upsert customer/subscription mapping in DB using session.metadata or client_reference_id
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        console.log('[webhook] subscription lifecycle event:', event.type);
        // TODO: upsert subscription row in your subscriptions table
        break;
      }
      default:
        console.log('[webhook] unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true }, { status: 200, headers });
  } catch (err: any) {
    console.error('[webhook] error handling event:', err);
    return NextResponse.json({ error: 'Failed handling webhook' }, { status: 500, headers });
  }
}
