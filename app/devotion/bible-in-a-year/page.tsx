'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PlanKey = 'canonical' | 'chronological' | 'otnt' | 'blended';
type Translation = 'ESV' | 'NIV' | 'KJV' | 'NLT' | 'CSB' | 'NKJV' | 'NASB';

type ByPlan = {
  key: PlanKey;
  title: string;
  description: string;
  emoji: string;
};

const PLANS: ByPlan[] = [
  { key: 'canonical',     title: 'Canonical (Genesis → Revelation)', emoji: '📚', description: 'Read straight through from Genesis to Revelation in ~365 readings.' },
  { key: 'chronological', title: 'Chronological (Story order)',      emoji: '🗓️', description: 'Follow an approximate historical timeline of events and writings.' },
  { key: 'otnt',          title: 'OT / NT (Daily mix)',              emoji: '⚖️', description: 'A balanced daily reading from the Old and New Testaments.' },
  { key: 'blended',       title: 'Blended (Varied mix)',              emoji: '🔀', description: 'Alternates across sections to keep variety and continuity.' },
];

const TRANSLATIONS: Translation[] = ['ESV', 'NIV', 'KJV', 'NLT', 'CSB', 'NKJV', 'NASB'];

type CurrentSelection = {
  id: string;
  household_id: string;
  plan_key: PlanKey;
  translation: Translation;
  start_date: string;     // ISO date (YYYY-MM-DD)
  reminder_time: string | null; // 'HH:mm' or null
  day_index: number;      // 0..364
  updated_at: string;
};

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: pull from session/tenant

export default function BibleInAYearPage() {
  // Current selection, if any
  const [current, setCurrent] = useState<CurrentSelection | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state (defaults)
  const [planKey, setPlanKey] = useState<PlanKey>('canonical');
  const [translation, setTranslation] = useState<Translation>('ESV');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [reminder, setReminder] = useState<string>(''); // HH:mm

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Load the household's current Bible-in-a-Year selection
      const { data, error } = await supabase
        .from('bible_year_selection')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const sel = data as CurrentSelection;
        setCurrent(sel);
        // Seed form from existing selection
        setPlanKey(sel.plan_key);
        setTranslation(sel.translation);
        setStartDate(sel.start_date);
        setReminder(sel.reminder_time || '');
      }
      setLoading(false);
    })();
  }, []);

  // Derived text for current selection
  const currentPlanMeta = useMemo(
    () => (current ? PLANS.find(p => p.key === current.plan_key) || null : null),
    [current]
  );

  async function startOrSwitchPlan() {
    // Basic validation
    if (!planKey) return alert('Please choose a plan.');
    if (!translation) return alert('Please choose a translation.');
    if (!startDate) return alert('Please choose a start date.');

    // Upsert the household selection
    const payload = {
      household_id: HOUSEHOLD_ID,
      plan_key: planKey,
      translation,
      start_date: startDate,
      reminder_time: reminder || null,
      // when switching plans, day_index resets to 0
      day_index: 0,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bible_year_selection')
      .upsert(payload, { onConflict: 'household_id' })
      .select()
      .single();

    if (error) return alert(error.message);
    setCurrent(data as CurrentSelection);
    alert('Bible in a Year plan saved.');
  }

  function continueToday() {
    // Route to a reading detail page for today’s slices (you can implement later)
    // Example route:
    window.location.href = '/devotion/bible-in-a-year/today';
  }

  return (
    <div className="container">
      <h1 className="page-title">Bible in a Year</h1>

      {/* ===== Current Selection Overview ===== */}
      <section className="card section">
        <h2 className="section-title">Current Selection</h2>

        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : !current ? (
          <div className="subtitle">No Bible-in-a-Year plan selected yet.</div>
        ) : (
          <div className="category-card" style={{ flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            <strong>
              {currentPlanMeta?.emoji ? `${currentPlanMeta.emoji} ` : ''}{currentPlanMeta?.title || current.plan_key}
            </strong>
            <div className="subtitle">
              Translation: <strong>{current.translation}</strong> • Start: <strong>{current.start_date}</strong>
              {current.reminder_time ? <> • Daily reminder: <strong>{current.reminder_time}</strong></> : null}
            </div>
            <div className="subtitle">
              Progress: Day <strong>{current.day_index + 1}</strong> / 365
            </div>
            <div className="subcategories">
              <button className="btn btn--lg accent-green" onClick={continueToday}>▶ Continue Today</button>
              <Link href="/planner/calendar" className="btn btn--lg accent-amber">🗓️ Add to Calendar</Link>
            </div>
          </div>
        )}

        <div className="subcategories">
          <Link href="/devotion" className="btn btn--sm">↩ Devotion Home</Link>
          <Link href="/devotion/bible-study" className="btn btn--sm accent-violet">📖 Family Bible Study</Link>
        </div>
      </section>

      {/* ===== Choose / Switch Plan ===== */}
      <section className="card section" id="select-plan">
        <h2 className="section-title">Select a Bible-in-a-Year Plan</h2>

        {/* Plan options grid */}
        <div className="categories" style={{ marginBottom: 8 }}>
          {PLANS.map(p => (
            <label key={p.key} className="category-card" style={{ flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{p.emoji} {p.title}</strong>
                <input
                  type="radio"
                  name="plan_key"
                  checked={planKey === p.key}
                  onChange={() => setPlanKey(p.key)}
                />
              </div>
              <div className="subtitle">{p.description}</div>
            </label>
          ))}
        </div>

        {/* Settings row */}
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <input
            className="btn btn--sm"
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />

          <select
            className="btn btn--sm"
            value={translation}
            onChange={e => setTranslation(e.target.value as Translation)}
            aria-label="Translation"
          >
            {TRANSLATIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input
            className="btn btn--sm"
            type="time"
            aria-label="Daily reminder (optional)"
            placeholder="Reminder (optional)"
            value={reminder}
            onChange={e => setReminder(e.target.value)}
          />
        </div>

        <div className="subcategories">
          <button className="btn btn--lg accent-green" onClick={startOrSwitchPlan}>
            {current ? '🔄 Switch Plan' : '🚀 Start Plan'}
          </button>
          <Link href="/devotion/bible-in-a-year/today" className="btn btn--lg">📅 View Today’s Reading</Link>
        </div>
      </section>
    </div>
  );
}
