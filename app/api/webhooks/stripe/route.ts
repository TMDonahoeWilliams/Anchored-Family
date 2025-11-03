import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
  return new NextResponse(null, { status: 204, headers: Object.fromEntries(corsHeaders(req.headers.get('origin') || undefined).entries()) });
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

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[webhook] Supabase service role not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers });
  }
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // read raw body
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature');

  console.log('[webhook] incoming request — payloadLength=', payload.length, ' signaturePresent=', !!sig);

  if (!sig) {
    console.warn('[webhook] stripe-signature header missing');
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400, headers });
  }

  console.log('[webhook] signature header preview:', mask(sig));

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err?.message ?? err);
    console.error('[webhook] payload preview:', payload.slice(0, 1000));
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message ?? String(err)}` }, { status: 400, headers });
  }

  try {
    console.log('[webhook] verified event type=', event.type);

    // Helper to upsert subscription row
    async function upsertSubscriptionFromStripeSubscription(sub: any, userIdFromCustomers?: string | null) {
      const stripeSubId = sub.id;
      const cust = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const status = sub.status ?? null;
      const cps = sub.current_period_start ? new Date(Number(sub.current_period_start) * 1000).toISOString() : null;
      const cpe = sub.current_period_end ? new Date(Number(sub.current_period_end) * 1000).toISOString() : null;

      // Resolve user_id: prefer metadata or client_reference, else lookup customers mapping
      let userId: string | null = userIdFromCustomers ?? (sub.metadata?.user_id ?? null);

      if (!userId && cust) {
        const { data: custRow, error: custErr } = await supabaseAdmin
          .from('customers')
          .select('user_id')
          .eq('customer_id', cust)
          .limit(1)
          .single();
        if (!custErr && custRow?.user_id) userId = custRow.user_id;
      }

      const upsertRow: any = {
        user_id: userId,
        customer_id: cust,
        stripe_subscription_id: stripeSubId,
        price_id: priceId,
        status,
        current_period_start: cps,
        current_period_end: cpe,
        updated_at: new Date().toISOString(),
      };

      // If creating, ensure created_at is set
      const { error: upsertErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert(upsertRow, { onConflict: 'stripe_subscription_id' });

      if (upsertErr) {
        console.error('[webhook] failed to upsert subscription', upsertErr);
      } else {
        console.log('[webhook] upserted subscription', stripeSubId, 'user:', userId);
      }
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        const subscriptionId = session.subscription ?? null;
        const customerId = session.customer ?? null;

        if (subscriptionId) {
          // retrieve subscription to get expanded details
          const subscription = await stripe.subscriptions.retrieve(String(subscriptionId), { expand: ['items.data.price'] });
          await upsertSubscriptionFromStripeSubscription(subscription, userId);
        } else {
          // No subscription on session; might be one-time payment — handle accordingly
          console.log('[webhook] checkout.session.completed without subscription', session.id);
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        // upsert subscription row
        await upsertSubscriptionFromStripeSubscription(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        // Optionally update subscription status if needed
        const stripeSubId = invoice.subscription;
        if (stripeSubId) {
          // fetch subscription to update periods and status
          const subscription = await stripe.subscriptions.retrieve(String(stripeSubId), { expand: ['items.data.price'] });
          await upsertSubscriptionFromStripeSubscription(subscription);
        }
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
