'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: inject from session

type Member = {
  id: string;
  household_id: string;
  name: string;
  email: string | null;
  role: 'member' | 'manager';
  avatar_url?: string | null;
};

type Chore = {
  id: string;
  assignee_id: string;
  title: string;
  status: 'open' | 'done';
  due_at: string | null;
};

type CalEvent = {
  id: string;
  member_id: string;
  title: string;
  start_at: string;
  end_at: string | null;
};

type ReadingItem = {
  id: string;
  member_id: string;
  title: string;
  status: 'planned' | 'in_progress' | 'completed';
};

export default function MembersPage() {
  // Add form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'manager'>('member');

  // Data
  const [members, setMembers] = useState<Member[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [reading, setReading] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all overview data
  useEffect(() => {
    (async () => {
      setLoading(true);

      // Members
      const { data: mems } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('name', { ascending: true });
      const memberList = (mems || []) as Member[];
      setMembers(memberList);

      const memberIds = memberList.map(m => m.id);
      if (memberIds.length === 0) {
        setChores([]); setEvents([]); setReading([]);
        setLoading(false);
        return;
      }

      // Chores (all, we’ll aggregate in UI)
      const { data: ch } = await supabase
        .from('chores')
        .select('id, assignee_id, title, status, due_at')
        .in('assignee_id', memberIds);
      setChores((ch || []) as Chore[]);

      // Events: next 30 days
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 30);

      const { data: ev } = await supabase
        .from('calendar_events')
        .select('id, member_id, title, start_at, end_at')
        .in('member_id', memberIds)
        .gte('start_at', start.toISOString())
        .lte('start_at', end.toISOString())
        .order('start_at', { ascending: true });
      setEvents((ev || []) as CalEvent[]);

      // Reading list
      const { data: rl } = await supabase
        .from('reading_list')
        .select('id, member_id, title, status')
        .in('member_id', memberIds);
      setReading((rl || []) as ReadingItem[]);

      setLoading(false);
    })();
  }, []);

  // Aggregations per member
  const choreByMember = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const m of members) map[m.id] = { total: 0, done: 0 };
    for (const c of chores) {
      if (!map[c.assignee_id]) map[c.assignee_id] = { total: 0, done: 0 };
      map[c.assignee_id].total += 1;
      map[c.assignee_id].done += c.status === 'done' ? 1 : 0;
    }
    return map;
  }, [members, chores]);

  const eventsByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of members) map[m.id] = 0;
    for (const e of events) {
      map[e.member_id] = (map[e.member_id] || 0) + 1;
    }
    return map;
  }, [members, events]);

  const readingByMember = useMemo(() => {
    const map: Record<string, { total: number; completed: number }> = {};
    for (const m of members) map[m.id] = { total: 0, completed: 0 };
    for (const r of reading) {
      const m = r.member_id;
      if (!map[m]) map[m] = { total: 0, completed: 0 };
      map[m].total += 1;
      map[m].completed += r.status === 'completed' ? 1 : 0;
    }
    return map;
  }, [members, reading]);

  async function addMember() {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name) return alert('Please enter a name');
    const { data, error } = await supabase
      .from('household_members')
      .insert({
        household_id: HOUSEHOLD_ID,
        name,
        email: email || null,
        role: newRole
      })
      .select()
      .single();
    if (error) return alert(error.message);
    setMembers(prev => [...prev, data as Member].sort((a,b) => a.name.localeCompare(b.name)));
    setNewName(''); setNewEmail('');
  }

  async function removeMember(memberId: string) {
    const target = members.find(m => m.id === memberId);
    if (!target) return;
    if (target.role === 'manager') return alert('Cannot remove the household manager.');
    await supabase.from('household_members').delete().eq('id', memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    // Optionally also clean up related rows or leave them for history
  }

  return (
    <div className="container">
      <h1 className="page-title">Household Members</h1>

      {/* Shortcuts */}
      <section className="card section">
        <h2 className="section-title">Shortcuts</h2>
        <div className="subcategories">
          <Link href="/account/manager" className="btn btn--sm accent-violet">👤 Household Manager</Link>
          <Link href="/account/settings" className="btn btn--sm accent-green">⚙️ Account Settings</Link>
          <Link href="/planner/chores" className="btn btn--sm accent-blue">🧹 Manage Chores</Link>
          <Link href="/planner/calendar" className="btn btn--sm accent-amber">🗓️ Family Calendar</Link>
          <Link href="/devotion/reading" className="btn btn--sm accent-cyan">📖 Reading List</Link>
        </div>
      </section>

      {/* Add member */}
      <section className="card section">
        <h2 className="section-title">Add a Member</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <input className="btn btn--sm" placeholder="Full name" value={newName} onChange={e=>setNewName(e.target.value)} />
          <input className="btn btn--sm" placeholder="Email (optional)" value={newEmail} onChange={e=>setNewEmail(e.target.value)} />
          <select className="btn btn--sm" value={newRole} onChange={e=>setNewRole(e.target.value as any)}>
            <option value="member">Member</option>
            <option value="manager">Manager</option>
          </select>
          <select className="btn btn--sm" value={newRole} onChange={e=>setNewRole(e.target.value as any)}>
            <option value="Child">Child</option>
            <option value="Teen">Teen</option>
            <option value="Adult">Adult</option>
          </select>
          <button className="btn btn--sm accent-green" onClick={addMember}>➕ Add Member</button>
        </div>
      </section>

      {/* Members overview grid */}
      <section className="section">
        <h2 className="section-title">Overview</h2>
        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : members.length === 0 ? (
          <div className="subtitle">No members yet. Add one above.</div>
        ) : (
          <div className="categories">
            {members.map(m => {
              const choresSum = choreByMember[m.id] || { total: 0, done: 0 };
              const upcoming  = eventsByMember[m.id] || 0;
              const readSum   = readingByMember[m.id] || { total: 0, completed: 0 };
              return (
                <div key={m.id} className="category-card" style={{ flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{m.name}</strong>
                    {m.role === 'manager' && <span className="pill">Manager</span>}
                  </div>
                  <div className="subtitle">{m.email || '—'}</div>

                  <div className="card" style={{ padding: '.5rem', width: '100%' }}>
                    <div className="subtitle">Chores: <strong>{choresSum.done}</strong> / {choresSum.total}</div>
                    <div className="subtitle">Upcoming events (30d): <strong>{upcoming}</strong></div>
                    <div className="subtitle">Reading: <strong>{readSum.completed}</strong> / {readSum.total}</div>
                  </div>

                  <div className="subcategories">
                    <Link href={`/account/members/${m.id}`} className="btn btn--sm">Open</Link>
                    <Link href={`/planner/chores?assignee=${m.id}`} className="btn btn--sm accent-blue">Assign Chore</Link>
                    <Link href={`/planner/calendar?member=${m.id}`} className="btn btn--sm accent-amber">Add Event</Link>
                    <Link href={`/devotion/reading?member=${m.id}`} className="btn btn--sm accent-cyan">Reading List</Link>
                  </div>

                  {m.role !== 'manager' && (
                    <button className="btn btn--sm accent-rose" onClick={() => removeMember(m.id)}>Remove</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
