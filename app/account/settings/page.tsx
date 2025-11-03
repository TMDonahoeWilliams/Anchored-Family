'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/**
 * Account Settings page (client component)
 *
 * Updated: plan list now includes three paid tiers with prices:
 * - Basic   - $4.99
 * - Plus    - $7.99
 * - Premium - $9.99
 *
 * Notes:
 * - planCompare now lists Basic/Plus/Premium and their prices.
 * - PlanInfo and related logic updated to use 'Basic' instead of 'Free'.
 * - goToBilling expects plan codes 'basic' | 'plus' | 'premium'.
 *
 * Server expectations:
 * - Ensure server maps plan codes to correct Stripe Price IDs.
 * - Ensure subscriptions table / webhook reflect the same plan ids.
 */

type Settings = {
  id: string;
  household_id: string;
  timezone: string | null;
  locale: string | null;
  country: string | null;
  vat: string | null;
  keep_signed_in: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  inapp_notifications: boolean;
  show_locked_nav: boolean;
  updated_at: string;
};

type LinkedLogin = { provider: string; email?: string | null; created_at?: string | null };
type SessionItem = { id: string; device: string; ip: string; created_at: string; last_active: string; current: boolean };
type PlanInfo = {
  plan: 'Basic' | 'Plus' | 'Premium';
  status: 'active' | 'canceled' | 'trialing' | 'past_due';
  renews_at?: string | null;
  price?: string | null;
  benefits: string[];
};

export default function AccountSettingsPage() {
  // Core state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth / user
  const [userId, setUserId] = useState<string | null>(null);

  // Security & sessions
  const [linked, setLinked] = useState<LinkedLogin[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  // Billing - default to Basic (app uses server data to override when available)
  const [plan, setPlan] = useState<PlanInfo>({
    plan: 'Basic',
    status: 'active',
    renews_at: null,
    price: '$4.99',
    benefits: ['Core features', '1 household', 'Basic support'],
  });

  // Local editable fields
  const [timezone, setTimezone] = useState('');
  const [locale, setLocale] = useState('');
  const [country, setCountry] = useState('');
  const [vat, setVat] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [inappOn, setInappOn] = useState(true);
  const [showLocked, setShowLocked] = useState(false);

  // Password / 2FA form bits
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);

  // Redeem code
  const [redeemCode, setRedeemCode] = useState('');

  // Known public price IDs (optional). Populate these in Vercel / environment for correct mapping.
  const PLUS_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_PLUS_ID ?? '';
  const PREMIUM_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_PREMIUM_ID ?? '';
  const BASIC_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_BASIC_ID ?? '';

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Pull current user from supabase client (canonical id)
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.warn('[account] supabase.auth.getUser error:', error);
        } else if (data?.user?.id) {
          setUserId(data.user.id);
        }
      } catch (e) {
        console.warn('[account] supabase.auth.getUser threw', e);
      }

      // Load settings (seed if missing)
      const { data: s } = await supabase
        .from('account_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      let seeded = s as Settings | null;
      if (!seeded) {
        const { data } = await supabase
          .from('account_settings')
          .insert({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: 'en-US',
            country: 'US',
            vat: null,
            keep_signed_in: false,
            email_notifications: true,
            push_notifications: false,
            inapp_notifications: true,
            show_locked_nav: false,
          })
          .select()
          .single();
        seeded = data as Settings;
      }
      setSettings(seeded);

      // Apply UI values
      if (seeded) {
        setTimezone(seeded.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        setLocale(seeded.locale || 'en-US');
        setCountry(seeded.country || 'US');
        setVat(seeded.vat || '');
        setKeepSignedIn(!!seeded.keep_signed_in);
        setEmailOn(!!seeded.email_notifications);
        setPushOn(!!seeded.push_notifications);
        setInappOn(!!seeded.inapp_notifications);
        setShowLocked(!!seeded.show_locked_nav);
      }

      // Linked logins (stub)
      setLinked([
        { provider: 'email', email: 'manager@example.com', created_at: '2024-01-01' },
      ]);

      // Active sessions (stub)
      setSessions([
        { id: 'sess-current', device: 'This device (Chrome · Windows)', ip: '73.22.10.45', created_at: '2025-01-01', last_active: new Date().toISOString(), current: true },
        { id: 'sess-2', device: 'iPhone 14 (Anchored Family app)', ip: '10.0.0.2', created_at: '2025-08-20', last_active: '2025-10-08T12:00:00Z', current: false },
      ]);

      // --- NEW: attempt to load subscription from Supabase table 'subscriptions' ---
      // The webhook should upsert subscription rows when Stripe events occur.
      try {
        if (userId) {
          const { data: sub, error: subErr } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subErr) {
            console.warn('[account] error fetching subscription row', subErr);
          } else if (sub) {
            // Map subscription row to PlanInfo
            const priceId = (sub.price_id || sub.price || sub.price_id_text || '') as string;
            const status = (sub.status || 'active') as PlanInfo['status'];
            const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null;

            // Determine plan by price id (prefer env mapping), fallback to simple heuristics.
            let planName: PlanInfo['plan'] = 'Basic';
            let priceDisplay = '$4.99';
            if (priceId) {
              if (BASIC_PRICE_ID && priceId === BASIC_PRICE_ID) {
                planName = 'Basic';
                priceDisplay = '$4.99';
              } else if (PLUS_PRICE_ID && priceId === PLUS_PRICE_ID) {
                planName = 'Plus';
                priceDisplay = '$7.99';
              } else if (PREMIUM_PRICE_ID && priceId === PREMIUM_PRICE_ID) {
                planName = 'Premium';
                priceDisplay = '$9.99';
              } else {
                // fallback heuristics: check substring, or price amount field if present
                const p = priceId.toLowerCase();
                if (p.includes('basic')) { planName = 'Basic'; priceDisplay = '$4.99'; }
                else if (p.includes('plus')) { planName = 'Plus'; priceDisplay = '$7.99'; }
                else if (p.includes('premium')) { planName = 'Premium'; priceDisplay = '$9.99'; }
                else {
                  // if the subscription row includes a price amount, use it
                  if (sub.price_amount) priceDisplay = `$${(sub.price_amount / 100).toFixed(2)}`;
                }
              }
            }

            setPlan({
              plan: planName,
              status,
              renews_at: currentPeriodEnd,
              price: priceDisplay,
              benefits: planName === 'Basic'
                ? ['Core features', '1 household', 'Basic support']
                : planName === 'Plus'
                  ? ['Family Planner Pro', 'Recipe AI ideas', 'Priority support']
                  : ['Everything in Plus', 'Unlimited households', 'Vault & Devotion Pro', 'Advanced sharing'],
            });
          } else {
            // No subscription row -> default Basic
            setPlan({
              plan: 'Basic',
              status: 'active',
              renews_at: null,
              price: '$4.99',
              benefits: ['Core features', '1 household', 'Basic support'],
            });
          }
        } else {
          // If not logged in yet, leave default Basic for now
        }
      } catch (err) {
        console.error('[account] failed to fetch subscription', err);
      }

      setLoading(false);
    })();
  }, [userId, PLUS_PRICE_ID, PREMIUM_PRICE_ID, BASIC_PRICE_ID]);

  const planCompare = useMemo(
    () => [
      { name: 'Basic',    price: '$4.99', perks: ['Core features', '1 household', 'Basic support'], code: 'basic' },
      { name: 'Plus',     price: '$7.99', perks: ['Family Planner Pro', 'Recipe AI ideas', 'Priority support'], code: 'plus' },
      { name: 'Premium',  price: '$9.99', perks: ['Everything in Plus', 'Unlimited households', 'Vault & Devotion Pro', 'Advanced sharing'], code: 'premium' },
    ],
    []
  );

  async function saveLocalization() {
    if (!settings) return;
    const { data, error } = await supabase
      .from('account_settings')
      .update({
        timezone,
        locale,
        country,
        vat: vat || null,
        keep_signed_in: keepSignedIn,
      })
      .eq('id', settings.id)
      .select()
      .single();
    if (error) return alert(error.message);
    setSettings(data as Settings);
    alert('Localization & session preferences saved.');
  }

  async function saveNotifications() {
    if (!settings) return;
    const { data, error } = await supabase
      .from('account_settings')
      .update({
        email_notifications: emailOn,
        push_notifications:  pushOn,
        inapp_notifications: inappOn,
        show_locked_nav:     showLocked,
      })
      .eq('id', settings.id)
      .select()
      .single();
    if (error) return alert(error.message);
    setSettings(data as Settings);
    alert('Notification settings saved.');
  }

  async function changePassword() {
    if (pwNew !== pwConfirm) return alert('New passwords do not match.');
    if (!pwNew || pwNew.length < 8) return alert('Password must be at least 8 characters.');
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
    alert('Password change requested (wire to Auth).');
  }

  async function toggle2FA() {
    setTwoFAEnabled(v => !v);
    alert('2FA toggle requested (connect to your 2FA API).');
  }

  async function unlinkProvider(p: string) {
    alert(`Unlink ${p} requested.`);
  }

  async function revokeSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
    alert('Session revoked.');
  }

  async function deleteAccount() {
    if (!confirm('Delete your account and household data? This cannot be undone.')) return;
    alert('Account deletion requested.');
  }

  async function redeem() {
    if (!redeemCode.trim()) return alert('Enter a code to redeem.');
    setRedeemCode('');
    alert('Redeem requested (connect to billing).');
  }

  /**
   * Billing helper
   *
   * target: 'basic'|'plus'|'premium' -> starts checkout for that plan.
   *         'manage' -> open billing portal
   *         'cancel' -> request cancellation flow
   *
   * Server-side expectations:
   * - /api/billing/checkout maps plan -> Stripe Price ID and creates a Checkout Session with:
   *     client_reference_id or metadata.user_id set to the canonical user id passed here
   *     success_url that includes {CHECKOUT_SESSION_ID} placeholder
   */
  async function goToBilling(target: 'basic' | 'plus' | 'premium' | 'manage' | 'cancel') {
    if (!userId && target !== 'manage') {
      alert('You must be signed in to manage billing.');
      return;
    }

    try {
      if (target === 'manage') {
        const res = await fetch('/api/billing/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ return_url: `${window.location.origin}/home` }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error || `Portal init failed (${res?.status})`);
        if (!payload?.url) throw new Error('Billing portal did not return a url.');
        window.location.assign(payload.url);
        return;
      }

      if (target === 'cancel') {
        const res = await fetch('/api/billing/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error || `Cancel request failed (${res?.status})`);
        alert('Cancellation requested.');
        return;
      }

      // Start checkout for the requested plan (upgrade/downgrade)
      const payload = {
        plan: target,
        orgId: settings?.household_id ?? undefined,
        userId,
        customer_email: undefined,
        successPath: '/home?welcome=1&session_id={CHECKOUT_SESSION_ID}',
        cancelPath: '/settings/billing?canceled=1',
      };

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error || `Checkout initiation failed (${res?.status})`;
        console.error('[billing] checkout init failed', { msg, data });
        throw new Error(msg);
      }

      const url = data?.url;
      if (!url) {
        console.error('[billing] checkout response missing url', data);
        throw new Error('Checkout did not return a redirect URL. Check server price mapping.');
      }

      window.location.assign(url);
    } catch (err: any) {
      console.error('[billing] error', err);
      alert(err?.message ?? 'Billing request failed. See console for details.');
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Account Settings</h1>

      {/* ===== Localization / Timezone / Session ===== */}
      <section className="card section">
        <h2 className="section-title">Region & Session</h2>
        {loading ? <div className="subtitle">Loading…</div> : (
          <>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Timezone (e.g., America/Chicago)" value={timezone} onChange={e => setTimezone(e.target.value)} />
              <input className="btn btn--sm" placeholder="Locale (e.g., en-US)" value={locale} onChange={e => setLocale(e.target.value)} />
              <input className="btn btn--sm" placeholder="Country (ISO2, e.g., US)" value={country} onChange={e => setCountry(e.target.value)} />
              <input className="btn btn--sm" placeholder="Tax/VAT ID (optional)" value={vat} onChange={e => setVat(e.target.value)} />
            </div>
            <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
              <span>Keep me signed in</span>
              <input type="checkbox" checked={keepSignedIn} onChange={e => setKeepSignedIn(e.target.checked)} />
            </label>
            <div className="subcategories" style={{ marginTop: 8 }}>
              <button className="btn btn--sm accent-green" onClick={saveLocalization}>Save</button>
            </div>
          </>
        )}
      </section>

      {/* ===== Security: Password / 2FA / Linked Logins ===== */}
      <section className="card section">
        <h2 className="section-title">Security</h2>

        {/* Change password */}
        <div className="section" style={{ marginBottom: 8 }}>
          <h3 className="section-title">Change Password</h3>
          <div className="subcategories" style={{ marginBottom: 8 }}>
            <input className="btn btn--sm" type="password" placeholder="Current password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} />
            <input className="btn btn--sm" type="password" placeholder="New password" value={pwNew} onChange={e => setPwNew(e.target.value)} />
            <input className="btn btn--sm" type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} />
          </div>
          <button className="btn btn--sm accent-green" onClick={changePassword}>Update Password</button>
        </div>

        {/* 2FA */}
        <div className="section" style={{ marginBottom: 8 }}>
          <h3 className="section-title">Two-Factor Authentication</h3>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>{twoFAEnabled ? 'Enabled' : 'Disabled'}</span>
            <input type="checkbox" checked={twoFAEnabled} onChange={toggle2FA} />
          </label>
          <div className="subtitle" style={{ marginTop: 6 }}>
            Use an authenticator app (TOTP). When enabled, we’ll show a QR code to scan and a backup code list.
          </div>
        </div>

        {/* Linked logins */}
        <div className="section">
          <h3 className="section-title">Linked Logins</h3>
          {linked.length === 0 ? (
            <div className="subtitle">No linked logins.</div>
          ) : (
            <ul>
              {linked.map((l, idx) => (
                <li key={idx} className="card" style={{ margin: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{l.provider}</strong>
                    {l.email && <div className="subtitle">{l.email}</div>}
                  </div>
                  {l.provider !== 'email' && (
                    <button className="btn btn--sm accent-rose" onClick={() => unlinkProvider(l.provider)}>Unlink</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ===== Sessions & Devices ===== */}
      <section className="card section">
        <h2 className="section-title">Active Sessions & Devices</h2>
        {sessions.length === 0 ? (
          <div className="subtitle">No active sessions.</div>
        ) : (
          <ul>
            {sessions.map(s => (
              <li key={s.id} className="card" style={{ margin: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{s.device}</strong>
                  <div className="subtitle">
                    IP: {s.ip} · Created: {new Date(s.created_at).toLocaleDateString()}<br />
                    Last active: {new Date(s.last_active).toLocaleString()}
                  </div>
                </div>
                {s.current ? (
                  <span className="btn btn--sm accent-green" aria-disabled>
                    Current
                  </span>
                ) : (
                  <button className="btn btn--sm accent-rose" onClick={() => revokeSession(s.id)}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== Notifications & UI ===== */}
      <section className="card section">
        <h2 className="section-title">Notifications & UI</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>✉️ Email</span>
            <input type="checkbox" checked={emailOn} onChange={e => setEmailOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>🔔 Push</span>
            <input type="checkbox" checked={pushOn} onChange={e => setPushOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>📱 In-app</span>
            <input type="checkbox" checked={inappOn} onChange={e => setInappOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Show locked items in navigation</span>
            <input type="checkbox" checked={showLocked} onChange={e => setShowLocked(e.target.checked)} />
          </label>
        </div>
        <button className="btn btn--sm accent-green" onClick={saveNotifications}>Save Notification Settings</button>
      </section>

      {/* ===== Subscription & Billing ===== */}
      <section className="card section">
        <h2 className="section-title">Current Plan & Billing</h2>

        <div className="subcategories" style={{ marginBottom: 8 }}>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Plan</span>
            <span className="subtitle">{plan.plan} ({plan.status})</span>
          </div>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Price</span>
            <span className="subtitle">{plan.price || '—'}</span>
          </div>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Next renewal</span>
            <span className="subtitle">{plan.renews_at ? new Date(plan.renews_at).toLocaleDateString() : '—'}</span>
          </div>
        </div>

        <div className="categories" style={{ marginBottom: 8 }}>
          {planCompare.map(p => (
            <div key={p.name} className="category-card" style={{ flexDirection: 'column', gap: 6 }}>
              <strong>{p.name}</strong>
              <div className="subtitle">{p.price}/mo</div>
              <ul className="subtitle" style={{ marginLeft: 16 }}>
                {p.perks.map((x,i) => <li key={i}>• {x}</li>)}
              </ul>
              <button
                className="btn btn--sm accent-green"
                onClick={() => goToBilling(p.code as 'basic'|'plus'|'premium')}
              >
                {p.name === plan.plan ? 'Current' : (p.code === 'basic' ? 'Downgrade' : 'Upgrade')}
              </button>
            </div>
          ))}
        </div>

        <div className="subcategories" style={{ marginBottom: 8 }}>
          <button className="btn btn--sm" onClick={() => goToBilling('manage')}>Manage payment methods</button>
          <Link href="/billing/invoices" className="btn btn--sm accent-blue">Invoices & receipts</Link>
          <button className="btn btn--sm accent-rose" onClick={() => goToBilling('cancel')}>Cancel plan</button>
        </div>

        <div className="subcategories">
          <input className="btn btn--sm" placeholder="Redeem code / gift code" value={redeemCode} onChange={e => setRedeemCode(e.target.value)} />
          <button className="btn btn--sm accent-amber" onClick={redeem}>Redeem</button>
          <button className="btn btn--sm" onClick={() => alert('Restore purchases requested')}>Restore purchases</button>
        </div>
      </section>

      {/* ===== Access & Visibility ===== */}
      <section className="card section">
        <h2 className="section-title">Access & Visibility</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <Link href="/access" className="btn btn--sm accent-blue">What I can access</Link>
          <Link href="/features" className="btn btn--sm accent-cyan">Features by plan</Link>
          <Link href="/support" className="btn btn--sm">Contact Support</Link>
        </div>
      </section>

      {/* ===== Legal & Danger Zone ===== */}
      <section className="card section">
        <h2 className="section-title">Legal</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <Link href="/legal/terms" className="btn btn--sm">Terms of Service</Link>
          <Link href="/legal/privacy" className="btn btn--sm">Privacy Policy</Link>
          <Link href="/legal/licenses" className="btn btn--sm">Open-source Licenses</Link>
        </div>

        <h3 className="section-title" style={{ marginTop: 8, color: '#b91c1c' }}>Danger Zone</h3>
        <button className="btn btn--sm accent-rose" onClick={deleteAccount}>Delete Account</button>
      </section>
    </div>
  );
}
