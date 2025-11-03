'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/**
 * Account Settings page (client component)
 *
 * Key fixes made:
 * - Replace placeholder USER_ID/HOUSEHOLD_ID usage by reading the signed-in user (supabase.auth.getUser)
 *   and prefer the server-returned household id from the settings row.
 * - Implement goToBilling to call your billing endpoints:
 *    - POST /api/billing/checkout  -> starts Stripe Checkout (upgrade/downgrade)
 *    - POST /api/billing/portal    -> returns Stripe Billing Portal URL (manage)
 *    - POST /api/billing/cancel    -> optional cancel endpoint (calls backend)
 *   and redirect the user to Stripe URLs returned by the server.
 * - Ensure the client sends canonical userId to the billing API (so webhook matching can use it).
 * - Use successPath '/home?welcome=1&session_id={CHECKOUT_SESSION_ID}' (server should build full URL).
 * - Add defensive error handling and user-visible alerts for billing actions.
 *
 * Server requirements:
 * - /api/billing/checkout must accept { plan, orgId, userId, successPath, cancelPath } and return { url }
 *   where server maps plan -> Stripe price id (do not pass price id from client unless you intentionally want to).
 * - /api/billing/portal must accept { return_url } and return { url }.
 * - /api/billing/cancel (optional) should cancel subscription for the current user and return success.
 *
 * Notes about Stripe "price configuration error":
 * - That typically means Stripe Checkout was created with an invalid/missing price id. Ensure the server
 *   maps plan names to valid active Stripe Price IDs for the correct mode (recurring/subscription).
 * - Do not rely on client-side strings like username to identify user in webhook — pass canonical user id.
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
type SessionItem  = { id: string; device: string; ip: string; created_at: string; last_active: string; current: boolean };
type PlanInfo     = { plan: 'Free' | 'Plus' | 'Premium'; status: 'active' | 'canceled' | 'trialing' | 'past_due'; renews_at?: string | null; price?: string | null; benefits: string[] };

export default function AccountSettingsPage() {
  // Core state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth / user
  const [userId, setUserId] = useState<string | null>(null);

  // Security & sessions
  const [linked, setLinked] = useState<LinkedLogin[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  // Billing
  const [plan, setPlan] = useState<PlanInfo>({
    plan: 'Free',
    status: 'active',
    renews_at: null,
    price: '$0.00',
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

  // Password / 2FA form bits (wired to your auth later)
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);

  // Redeem code
  const [redeemCode, setRedeemCode] = useState('');

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
        // Prefer household id returned by server in session/settings; here fallback to first row if exists.
        .limit(1)
        .maybeSingle();

      let seeded = s as Settings | null;
      if (!seeded) {
        const { data } = await supabase
          .from('account_settings')
          .insert({
            // if you have household_id available from session, replace the string below
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

      // Linked logins (stub: replace with your auth providers list)
      setLinked([
        { provider: 'email', email: 'manager@example.com', created_at: '2024-01-01' },
      ]);

      // Active sessions (stub: swap with your /api/account/sessions)
      setSessions([
        { id: 'sess-current', device: 'This device (Chrome · Windows)', ip: '73.22.10.45', created_at: '2025-01-01', last_active: new Date().toISOString(), current: true },
        { id: 'sess-2', device: 'iPhone 14 (Anchored Family app)', ip: '10.0.0.2', created_at: '2025-08-20', last_active: '2025-10-08T12:00:00Z', current: false },
      ]);

      // Plan info (stub: pull from billing API /subscriptions table)
      setPlan({
        plan: 'Free',
        status: 'active',
        renews_at: null,
        price: '$0.00',
        benefits: ['Core features', '1 household', 'Basic support'],
      });

      setLoading(false);
    })();
  }, []);

  const planCompare = useMemo(
    () => [
      { name: 'Basic',    price: '$4.99',     perks: ['Core features', '1 household', 'Basic support'], code: 'free' },
      { name: 'Plus',    price: '$7.99',  perks: ['Family Planner Pro', 'Recipe AI ideas', 'Priority support'], code: 'plus' },
      { name: 'Premium', price: '$9.99',  perks: ['Everything in Plus', 'Unlimited households', 'Vault & Devotion Pro', 'Advanced sharing'], code: 'premium' },
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
   * target: 'free'|'plus'|'premium' -> starts checkout for that plan.
   *         'manage' -> open billing portal
   *         'cancel' -> request cancellation flow
   *
   * Server-side expectations:
   * - /api/billing/checkout maps plan -> Stripe Price ID and creates a Checkout Session with:
   *     client_reference_id or metadata.user_id set to the canonical user id passed here
   *     success_url that includes {CHECKOUT_SESSION_ID} placeholder
   * - /api/billing/portal returns a url for the Stripe Billing Portal
   */
  async function goToBilling(target: 'free' | 'plus' | 'premium' | 'manage' | 'cancel') {
    if (!userId && target !== 'manage') {
      alert('You must be signed in to manage billing.');
      return;
    }

    try {
      if (target === 'manage') {
        // Request billing portal URL
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
        // Optionally refresh plan info from server here
        return;
      }

      // Start checkout for the requested plan (upgrade/downgrade)
      // The server should map 'plus'/'premium' -> price IDs; client should NOT pass raw price IDs unless intended.
      const payload = {
        plan: target,
        orgId: settings?.household_id ?? undefined,
        userId,
        customer_email: undefined, // optional: if you have manager email, pass it e.g. settings?.manager_email
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
        // Surface server error to user for debugging
        const msg = data?.error || `Checkout initiation failed (${res?.status})`;
        console.error('[billing] checkout init failed', { msg, data });
        throw new Error(msg);
      }

      const url = data?.url;
      if (!url) {
        console.error('[billing] checkout response missing url', data);
        throw new Error('Checkout did not return a redirect URL. Check server price mapping.');
      }

      // Redirect user to Stripe Checkout
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
              <input className="btn btn--sm" placeholder="Timezone (e.g., America/Chicago)" value={timezone} onChange={e=>setTimezone(e.target.value)} />
              <input className="btn btn--sm" placeholder="Locale (e.g., en-US)" value={locale} onChange={e=>setLocale(e.target.value)} />
              <input className="btn btn--sm" placeholder="Country (ISO2, e.g., US)" value={country} onChange={e=>setCountry(e.target.value)} />
              <input className="btn btn--sm" placeholder="Tax/VAT ID (optional)" value={vat} onChange={e=>setVat(e.target.value)} />
            </div>
            <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
              <span>Keep me signed in</span>
              <input type="checkbox" checked={keepSignedIn} onChange={e=>setKeepSignedIn(e.target.checked)} />
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
            <input className="btn btn--sm" type="password" placeholder="Current password" value={pwCurrent} onChange={e=>setPwCurrent(e.target.value)} />
            <input className="btn btn--sm" type="password" placeholder="New password" value={pwNew} onChange={e=>setPwNew(e.target.value)} />
            <input className="btn btn--sm" type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} />
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
            <input type="checkbox" checked={emailOn} onChange={e=>setEmailOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>🔔 Push</span>
            <input type="checkbox" checked={pushOn} onChange={e=>setPushOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>📱 In-app</span>
            <input type="checkbox" checked={inappOn} onChange={e=>setInappOn(e.target.checked)} />
          </label>
          <label className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Show locked items in navigation</span>
            <input type="checkbox" checked={showLocked} onChange={e=>setShowLocked(e.target.checked)} />
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
                onClick={() => goToBilling(p.code as 'free'|'plus'|'premium')}
              >
                {p.name === plan.plan ? 'Current' : (p.name.toLowerCase() === 'free' ? 'Downgrade' : 'Upgrade')}
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
          <input className="btn btn--sm" placeholder="Redeem code / gift code" value={redeemCode} onChange={e=>setRedeemCode(e.target.value)} />
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
