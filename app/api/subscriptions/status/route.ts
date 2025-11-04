import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripeInstance } from '@/lib/stripeServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });

    const stripe = getStripeInstance();
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });

    // Supabase admin
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[subscriptions/status] missing Supabase service role env var');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 1) Retrieve checkout session from Stripe
    let session: any = null;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err: any) {
      console.error('[subscriptions/status] stripe.checkout.sessions.retrieve failed', err?.message ?? err);
      return NextResponse.json({ error: 'Unable to retrieve checkout session' }, { status: 400 });
    }

    // 2) If session has a subscription, retrieve subscription from Stripe
    let stripeSubscription: any = null;
    if (session.subscription) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(String(session.subscription), { expand: ['items.data.price'] });
      } catch (err: any) {
        console.warn('[subscriptions/status] failed to retrieve subscription', err?.message ?? err);
        // continue — we'll still return session info
      }
    }

    // 3) Try to resolve a user_id from session metadata or client_reference_id or via customers mapping
    const candidateUserId = session.client_reference_id ?? session.metadata?.user_id ?? null;
    let dbSubscription: any = null;
    if (candidateUserId) {
      const { data: subRow, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', candidateUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!subErr && subRow) dbSubscription = subRow;
    } else if (stripeSubscription?.customer) {
      // fallback: lookup subscriptions by customer_id
      const customerId = typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : stripeSubscription.customer?.id;
      const { data: subRow, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!subErr && subRow) dbSubscription = subRow;
    }

    const result = {
      session: {
        id: session.id,
        mode: session.mode,
        customer: session.customer ?? null,
        client_reference_id: session.client_reference_id ?? null,
        metadata: session.metadata ?? {},
      },
      stripeSubscription: stripeSubscription
        ? {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            price_id: stripeSubscription.items?.data?.[0]?.price?.id ?? null,
            current_period_start: stripeSubscription.current_period_start ?? null,
            current_period_end: stripeSubscription.current_period_end ?? null,
          }
        : null,
      dbSubscription: dbSubscription ?? null,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('[subscriptions/status] unexpected error', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
