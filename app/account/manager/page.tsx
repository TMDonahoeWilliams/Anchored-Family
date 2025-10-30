'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Manager = {
  id: string;
  household_id: string;
  name: string;
  email: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: inject from auth/session

export default function ManagerPage() {
  const [loading, setLoading] = useState(true);
  const [mgr, setMgr] = useState<Manager | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [postal, setPostal] = useState('');

  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('household_managers')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .maybeSingle();

      if (error) console.error(error);

      if (data) {
        setMgr(data as Manager);
        setName(data.name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');

        setAddress1(data.address_line1 || '');
        setAddress2(data.address_line2 || '');
        setCity(data.city || '');
        setStateRegion(data.state || '');
        setPostal(data.postal_code || '');

        setEmName(data.emergency_contact_name || '');
        setEmPhone(data.emergency_contact_phone || '');
        setNotes(data.notes || '');
      }
      setLoading(false);
    })();
  }, []);

  function validate() {
    if (!name.trim()) return 'Name is required';
    if (!email.trim()) return 'Email is required';
    // Basic email check
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email';
    // Optional phone check
    if (phone && !/^[\d+\-\s().]{7,}$/.test(phone)) return 'Enter a valid phone';
    if (emPhone && !/^[\d+\-\s().]{7,}$/.test(emPhone)) return 'Enter a valid emergency phone';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) return alert(err);

    const payload = {
      household_id: HOUSEHOLD_ID,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      address_line1: address1.trim() || null,
      address_line2: address2.trim() || null,
      city: city.trim() || null,
      state: stateRegion.trim() || null,
      postal_code: postal.trim() || null,
      emergency_contact_name: emName.trim() || null,
      emergency_contact_phone: emPhone.trim() || null,
      notes: notes.trim() || null,
    };

    if (!mgr) {
      const { data, error } = await supabase
        .from('household_managers')
        .insert(payload)
        .select()
        .single();
      if (error) return alert(error.message);
      setMgr(data as Manager);
      alert('Manager created.');
      return;
    }

    const { data, error } = await supabase
      .from('household_managers')
      .update(payload)
      .eq('id', mgr.id)
      .select()
      .single();

    if (error) return alert(error.message);
    setMgr(data as Manager);
    alert('Manager updated.');
  }

  return (
    <div className="container">
      <h1 className="page-title">Household Manager</h1>

      {/* Quick links */}
      <section className="card section">
        <h2 className="section-title">Shortcuts</h2>
        <div className="subcategories">
          <Link href="/account/members" className="btn btn--sm accent-blue">👥 Household Members</Link>
          <Link href="/account/settings" className="btn btn--sm accent-green">⚙️ Account Settings</Link>
          <Link href="/account" className="btn btn--sm">↩ Back to Account</Link>
        </div>
      </section>

      {/* Manager form */}
      <section className="card section">
        <h2 className="section-title">Profile</h2>
        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : (
          <>
            {/* Identity */}
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Full name *" value={name} onChange={e=>setName(e.target.value)} />
              <input className="btn btn--sm" placeholder="Email *" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="btn btn--sm" placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} />
            </div>

            {/* Address */}
            <h3 className="section-title" style={{ marginTop: 8 }}>Address</h3>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Address line 1" value={address1} onChange={e=>setAddress1(e.target.value)} />
              <input className="btn btn--sm" placeholder="Address line 2" value={address2} onChange={e=>setAddress2(e.target.value)} />
              <input className="btn btn--sm" placeholder="City" value={city} onChange={e=>setCity(e.target.value)} />
              <input className="btn btn--sm" placeholder="State/Region" value={stateRegion} onChange={e=>setStateRegion(e.target.value)} />
              <input className="btn btn--sm" placeholder="Postal code" value={postal} onChange={e=>setPostal(e.target.value)} />
            </div>
            {/* Add any additional fields or buttons here */}
            <h3 className="section-title" style={{ marginTop: 8 }}>Emergency Contact</h3>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Emergency contact name" value={emName} onChange={e=>setEmName(e.target.value)} />
              <input className="btn btn--sm" placeholder="Emergency contact phone" value={emPhone} onChange={e=>setEmPhone(e.target.value)} />
            </div>
            <h3 className="section-title" style={{ marginTop: 8 }}>Notes</h3>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <textarea className="btn btn--sm" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
  <button className="btn accent-green" onClick={handleSave}>Save</button>
          </>
        )}
      </section>
    </div>
  );
}
