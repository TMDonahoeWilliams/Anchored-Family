import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!stripeKey || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars. Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Use the exact API version string expected by your stripe types
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-09-30.clover' });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log('Starting subscription periods backfill...');

  const { data: subsToFix, error } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_subscription_id, user_id, customer_id')
    .or('current_period_start.is.null,current_period_end.is.null')
    .limit(1000);

  if (error) {
    console.error('Failed to load subscriptions to backfill', error);
    process.exit(1);
  }

  console.log('Found', subsToFix?.length ?? 0, 'subscriptions to check');

  for (const row of subsToFix || []) {
    const subId = row.stripe_subscription_id;
    if (!subId) {
      console.log('Skipping row with no stripe_subscription_id', row);
      continue;
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(String(subId), { expand: ['items.data.price'] });

      const cps = subscription.current_period_start ?? subscription.trial_start ?? null;
      const cpe = subscription.current_period_end ?? subscription.trial_end ?? null;

      const upsertRow: any = {
        stripe_subscription_id: subId,
        updated_at: new Date().toISOString(),
      };

      if (cps) upsertRow.current_period_start = new Date(Number(cps) * 1000).toISOString();
      if (cpe) upsertRow.current_period_end = new Date(Number(cpe) * 1000).toISOString();

      const { error: upsertErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert(upsertRow, { onConflict: 'stripe_subscription_id' });

      if (upsertErr) {
        console.error('Failed to upsert subscription periods for', subId, upsertErr);
      } else {
        console.log('Updated periods for', subId, 'cps=', cps, 'cpe=', cpe);
      }
    } catch (err) {
      console.error('Error fetching subscription from Stripe for', subId, err);
    }
  }

  console.log('Backfill complete.');
}

main().catch(err => {
  console.error('Fatal error', err);
  process.exit(1);
});
