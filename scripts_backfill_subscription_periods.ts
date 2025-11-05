import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

/**
 * Backfill script: update subscriptions.current_period_start and current_period_end
 * for rows where those fields are null. Run locally / in CI with:
 *
 * STRIPE_SECRET_KEY=sk_live_xxx SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=ey... \
 *   npx ts-node scripts/backfill_subscription_periods.ts
 *
 * Note: This file intentionally uses `any` for the Stripe response to avoid
 * build-time type issues. This is a one-off admin script — do NOT import it
 * from your Next.js app code.
 */

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!stripeKey || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars. Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Use the Stripe API version your project expects
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
      // Treat the response as "any" so TS doesn't block on SDK typing differences.
      const subscription: any = await stripe.subscriptions.retrieve(String(subId), { expand: ['items.data.price'] });

      // Stripe returns epoch seconds (number) for these fields; fall back to trial_* if needed
      const cpsEpoch = subscription.current_period_start ?? subscription.trial_start ?? null;
      const cpeEpoch = subscription.current_period_end ?? subscription.trial_end ?? null;

      const upsertRow: any = {
        stripe_subscription_id: subId,
        updated_at: new Date().toISOString(),
      };

      if (cpsEpoch) upsertRow.current_period_start = new Date(Number(cpsEpoch) * 1000).toISOString();
      if (cpeEpoch) upsertRow.current_period_end = new Date(Number(cpeEpoch) * 1000).toISOString();

      // Only attempt the upsert if we actually have values to write
      if (!upsertRow.current_period_start && !upsertRow.current_period_end) {
        console.log('No period values for', subId, '- skipping update');
        continue;
      }

      const { error: upsertErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert(upsertRow, { onConflict: 'stripe_subscription_id' });

      if (upsertErr) {
        console.error('Failed to upsert subscription periods for', subId, upsertErr);
      } else {
        console.log('Updated periods for', subId, 'cps=', upsertRow.current_period_start, 'cpe=', upsertRow.current_period_end);
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
