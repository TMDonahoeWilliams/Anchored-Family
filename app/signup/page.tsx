'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Plan = 'basic' | 'plus' | 'premium';

type MemberForm = {
  role: 'Child' | 'Teen' | 'Adult' | '';
  user_id: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal?: string;
};

export default function SignupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('basic'); // Default Basic

  // Manager (required)
  const [mgr, setMgr] = useState({
    full_name: '',
    email: '',
    user_id: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    postal: '',
  });

  // Members (optional)
  const [members, setMembers] = useState<MemberForm[]>([]);

  function addMember()   { setMembers((m) => [...m, { role: '', user_id: '', email: '' }]); }
  function removeMember(i: number) { setMembers((m) => m.filter((_, idx) => idx !== i)); }
  function updateMember(i: number, patch: Partial<MemberForm>) {
    setMembers((m) => m.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function validate(): string | null {
    const required = [
      ['Household manager’s Full Name', mgr.full_name],
      ['Household manager’s Email', mgr.email],
      ['Household manager’s User ID', mgr.user_id],
      ['Household manager’s Phone', mgr.phone],
      ['Household manager’s Street Address', mgr.address],
      ['Household manager’s City', mgr.city],
      ['Household manager’s State', mgr.state],
      ['Household manager’s Country', mgr.country],
      ['Household manager’s Postal Code', mgr.postal],
    ];
    for (const [label, val] of required) {
      if (!String(val || '').trim()) return `Please enter: ${label}`;
    }
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const L = (x: string) => `Member #${i + 1} — ${x}`;
      if (!m.role) return `Please select ${L('Role (Child/Teen/Adult)')}`;
      if (!String(m.user_id || '').trim()) return `Please enter ${L('User ID')}`;
      if (!String(m.email || '').trim()) return `Please enter ${L('Email')}`;
    }
    return null;
  }

  // Helper: safely parse a fetch Response.
  // Reads text first so we can return clearer errors when the response is empty or not JSON.
  async function safeParseResponse(res: Response, label = 'response') {
    const text = await res.text();
    if (!text) {
      // Empty body
      if (res.ok) return null;
      throw new Error(`${label} returned empty body (status ${res.status}).`);
    }
    // Try parsing JSON; if it fails, surface the raw text for debugging
    try {
      return JSON.parse(text);
    } catch (err) {
      // Include a short preview of the raw response in the error so we can debug HTML/error pages
      const preview = text.length > 1000 ? text.slice(0, 1000) + '…' : text;
      throw new Error(`${label} returned invalid JSON: ${preview}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }

    setSubmitting(true);
    try {
      // 1) Create household + rows
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager: mgr, members, plan: selectedPlan }),
      });

      // Parse defensively (avoids throwing "Unexpected end of JSON input")
      const data = await safeParseResponse(res, '/api/signup');

      // If server responded non-2xx, prefer server error message when available
      if (!res.ok) {
        const serverMsg = data?.error || `Sign up failed with status ${res.status}`;
        throw new Error(serverMsg);
      }

      const householdId = data?.household_id as string | undefined;
      if (!householdId) throw new Error('Missing household id from signup response.');

      // 2) Plan branch
      if (selectedPlan === 'basic') {
        // Go verify email & login
        router.push('/login?checkEmail=1');
      } else {
        // Create Stripe checkout (plan = 'plus' | 'premium')
        // Send the plan string directly; ensure server maps 'plus'/'premium' to the correct Stripe price IDs.
        const billingPlan = selectedPlan;

        const cRes = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: billingPlan,
            orgId: householdId,            // treating household as org
            userId: mgr.user_id,           // your external id for admin/customer
            successPath: '/dashboard?welcome=1',
            cancelPath: '/settings/billing?canceled=1'
          }),
        });

        const cData = await safeParseResponse(cRes, '/api/billing/checkout');

        if (!cRes.ok) {
          const serverMsg = cData?.error || `Checkout init failed with status ${cRes.status}`;
          throw new Error(serverMsg);
        }

        const url = cData?.url as string | undefined;
        if (!url) {
          // If server returned something unexpected, include raw data in the error
          throw new Error(`Unable to start checkout: missing URL in response. Response preview: ${JSON.stringify(cData)}`);
        }

        // 3) Redirect to Stripe
        // window.location.assign is fine in client components
        window.location.assign(url);
      }
    } catch (e: any) {
      // Show friendly message; keep the detailed message for debugging
      setError(e?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const PlanCard = ({
    code, title, price, desc,
  }: { code: Plan; title: string; price: string; desc: string }) => {
    const active = selectedPlan === code;
    return (
      <button
        type="button"
        onClick={() => setSelectedPlan(code)}
        className="card"
        style={{
          textAlign: 'left',
          borderColor: active ? '#065f46' : 'rgba(0,0,0,.08)',
          borderWidth: '2px',
          cursor: 'pointer'
        }}
        aria-pressed={active}
      >
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{title}</span>
          <span className="pill">{price}</span>
        </div>
        <p className="subtitle" style={{ marginBottom: 0 }}>{desc}</p>
        <div style={{ marginTop: '.6rem' }}>
          <span className={`btn btn--xs ${active ? 'accent-green' : ''}`}>
            {active ? 'Selected' : 'Select'}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="container">
      <div className="brandbar" style={{ marginTop: '1rem' }}>
        <img className="logo" src="/logo.svg" alt="Anchored Family" />
        <div>
          <div className="brandname">Anchored Family</div>
          <div className="subtitle">Create your household, pick a plan, and get started.</div>
        </div>
        <span className="pill" style={{ marginLeft: 'auto' }}>Sign Up</span>
      </div>

      <form className="card" onSubmit={onSubmit}>
        {/* Plan selection */}
        <h2 className="section-title">Choose Your Plan</h2>
        <div className="subcategories" style={{ marginBottom: '.75rem' }}>
          <PlanCard
            code="basic"
            title="Basic"
            price="$0"
            desc="Core planner, basic devotions, shared calendar. Perfect to try Anchored Family."
          />
          <PlanCard
            code="plus"
            title="Plus"
            price="$7.99 / mo"
            desc="Everything in Basic + advanced budgeting, roles & sharing, priority support."
          />
          <PlanCard
            code="premium"
            title="Premium"
            price="$9.99 / mo"
            desc="Everything in Plus + deep study add-ons, family vault, and early access."
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,.08)', margin: '.75rem 0' }} />

        {/* Manager fields (required) */}
        <h2 className="section-title">Household Manager</h2>
        <div className="subcategories" style={{ marginBottom: '.75rem' }}>
          <input className="btn btn--sm" placeholder="Full Name *" value={mgr.full_name} onChange={(e) => setMgr({ ...mgr, full_name: e.target.value })} />
          <input className="btn btn--sm" placeholder="Email *" type="email" value={mgr.email} onChange={(e) => setMgr({ ...mgr, email: e.target.value })} />
          <input className="btn btn--sm" placeholder="User ID *" value={mgr.user_id} onChange={(e) => setMgr({ ...mgr, user_id: e.target.value })} />
          <input className="btn btn--sm" placeholder="Phone *" value={mgr.phone} onChange={(e) => setMgr({ ...mgr, phone: e.target.value })} />
          <input className="btn btn--sm" placeholder="Street Address *" value={mgr.address} onChange={(e) => setMgr({ ...mgr, address: e.target.value })} />
          <input className="btn btn--sm" placeholder="City *" value={mgr.city} onChange={(e) => setMgr({ ...mgr, city: e.target.value })} />
          <input className="btn btn--sm" placeholder="State *" value={mgr.state} onChange={(e) => setMgr({ ...mgr, state: e.target.value })} />
          <input className="btn btn--sm" placeholder="Country *" value={mgr.country} onChange={(e) => setMgr({ ...mgr, country: e.target.value })} />
          <input className="btn btn--sm" placeholder="Postal Code *" value={mgr.postal} onChange={(e) => setMgr({ ...mgr, postal: e.target.value })} />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,.08)', margin: '.75rem 0' }} />

        {/* Members (optional) */}
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Household Members (optional)</span>
          <button type="button" className="btn btn--xs accent-green" onClick={addMember}>+ Add Member</button>
        </div>

        {members.length === 0 && (
          <p className="subtitle" style={{ marginBottom: '.75rem' }}>
            You can add members now or later from your Account page.
          </p>
        )}

        {members.map((m, idx) => (
          <div key={idx} className="card" style={{ marginBottom: '.75rem' }}>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Member #{idx + 1}</span>
              <button type="button" className="btn btn--xs accent-rose" onClick={() => removeMember(idx)}>Remove</button>
            </div>

            <div className="subcategories" style={{ marginBottom: '.5rem' }}>
              <select className="btn btn--sm" value={m.role} onChange={(e) => updateMember(idx, { role: e.target.value as MemberForm['role'] })}>
                <option value="">Role * (Child, Teen, Adult)</option>
                <option value="Child">Child</option>
                <option value="Teen">Teen</option>
                <option value="Adult">Adult</option>
              </select>
              <input className="btn btn--sm" placeholder="User ID *" value={m.user_id} onChange={(e) => updateMember(idx, { user_id: e.target.value })} />
              <input className="btn btn--sm" placeholder="Email *" type="email" value={m.email} onChange={(e) => updateMember(idx, { email: e.target.value })} />
              <input className="btn btn--sm" placeholder="Phone (optional)" value={m.phone || ''} onChange={(e) => updateMember(idx, { phone: e.target.value })} />
              <input className="btn btn--sm" placeholder="Street Address (optional)" value={m.address || ''} onChange={(e) => updateMember(idx, { address: e.target.value })} />
              <input className="btn btn--sm" placeholder="City (optional)" value={m.city || ''} onChange={(e) => updateMember(idx, { city: e.target.value })} />
              <input className="btn btn--sm" placeholder="State (optional)" value={m.state || ''} onChange={(e) => updateMember(idx, { state: e.target.value })} />
              <input className="btn btn--sm" placeholder="Country (optional)" value={m.country || ''} onChange={(e) => updateMember(idx, { country: e.target.value })} />
              <input className="btn btn--sm" placeholder="Postal Code (optional)" value={m.postal || ''} onChange={(e) => updateMember(idx, { postal: e.target.value })} />
            </div>

            <p className="subtitle"><strong>Note:</strong> Role, User ID, and Email are required when adding a member.</p>
          </div>
        ))}

        {error && <p className="subtitle" style={{ color: '#b91c1c', marginTop: '.5rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <button type="submit" className="btn accent-blue" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Account'}
          </button>
          <Link href="/login" className="btn">Already have an account? Log in</Link>
        </div>
      </form>
    </div>
  );
}


