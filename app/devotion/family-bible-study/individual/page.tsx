'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type AgeGroup = 'child' | 'teen' | 'adult';
type Member = {
  id: string;
  household_id: string;
  name: string;
  email?: string | null;
  age_group: AgeGroup | null; // expects this column in household_members
};

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: replace with actual household id from session

export default function SelectIndividualBibleStudyPage() {
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // UI selections
  const [memberId, setMemberId] = useState<string>('');
  const selectedMember = useMemo(
    () => members.find(m => m.id === memberId) || null,
    [members, memberId]
  );

  // Age group is derived from the selected member
  const ageGroup: AgeGroup | '' = selectedMember?.age_group ?? '';

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('household_members')
        .select('id, household_id, name, email, age_group')
        .eq('household_id', HOUSEHOLD_ID)
        .order('name', { ascending: true });

      if (error) {
        console.error(error);
        setMembers([]);
      } else {
        const list = (data || []) as Member[];
        setMembers(list);
        // Default to first member with an age_group, then first member fallback
        const withAge = list.find(m => m.age_group);
        setMemberId(withAge?.id || list[0]?.id || '');
      }
      setLoading(false);
    })();
  }, []);

  function goToSearch() {
    if (!selectedMember || !ageGroup) {
      alert('Please select a member with an age group.');
      return;
    }
    const params = new URLSearchParams({
      audience: ageGroup,  // child | teen | adult
      member: selectedMember.id,
    });
    router.push(`/devotion/family-bible-study/search?${params.toString()}`);
  }

  return (
    <div className="container">
      <h1 className="page-title">Select Individual Bible Study</h1>

      {/* Helpful shortcuts */}
      <section className="card section">
        <h2 className="section-title">Shortcuts</h2>
        <div className="subcategories">
          <Link href="/devotion/family-bible-study" className="btn btn--sm">↩ Bible Study Home</Link>
          <Link href="/devotion/family-bible-study/family" className="btn btn--sm accent-green">👨‍👩‍👧‍👦 Family Study</Link>
          <Link href="/devotion/family-bible-study/search" className="btn btn--sm accent-amber">🔎 Open Search</Link>
        </div>
      </section>

      {/* Selection UI */}
      <section className="card section">
        <h2 className="section-title">Choose a Member</h2>

        {loading ? (
          <div className="subtitle">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="subtitle">
            No household members found. Add members on the{' '}
            <Link href="/account/members" className="btn btn--sm accent-blue" style={{ display: 'inline-flex' }}>
              Household Members
            </Link>{' '}
            page.
          </div>
        ) : (
          <>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <select
                className="btn btn--sm"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                aria-label="Select household member"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.age_group ? ` (${m.age_group})` : ''}
                  </option>
                ))}
              </select>

              {/* Read-only display of derived age group */}
              <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
                <span>Age Group</span>
                <strong className="subtitle">{ageGroup || '—'}</strong>
              </div>
            </div>

            {!ageGroup && (
              <div className="subtitle" style={{ marginBottom: 8 }}>
                This member doesn’t have an age group set. You can add one on the{' '}
                <Link href="/account/members" className="btn btn--xs accent-blue" style={{ display: 'inline-flex' }}>
                  Household Members
                </Link>{' '}
                page (choose: <em>child</em>, <em>teen</em>, or <em>adult</em>).
              </div>
            )}

            <div className="subcategories">
              <button className="btn btn--lg accent-violet" onClick={goToSearch} disabled={!ageGroup}>
                🔎 Search Studies for {selectedMember?.name || 'Member'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Tip card */}
      <section className="card section">
        <h2 className="section-title">How it works</h2>
        <ul className="subtitle" style={{ marginLeft: 16 }}>
          <li>Pick a household member — we use their <strong>Age Group</strong> to narrow studies.</li>
          <li>We’ll open the Search page with filters pre-filled (e.g., <em>audience=teen</em>).</li>
          <li>From there, you can refine by Bible book, study length, or availability (in-app/purchase).</li>
        </ul>
      </section>
    </div>
  );
}
