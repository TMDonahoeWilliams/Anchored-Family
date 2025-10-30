'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Audience = 'family' | 'child' | 'teen' | 'adult';
type Availability = 'in-app' | 'purchase';

type Study = {
  id: string;
  title: string;
  plan_days: number;
  book?: string;
  audience: Audience;
  availability: Availability;
  emoji?: string;
  description?: string;
  popularity?: number;
};

const BIBLE_BOOKS = [
  '', 'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Songs','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
];

export default function SearchBibleStudyPage() {
  // State
  const [studies, setStudies] = useState<Study[]>([]);
  const [popular, setPopular] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Filters
  const [book, setBook] = useState<string>('');
  const [audience, setAudience] = useState<Audience | ''>('');
  const [length, setLength] = useState<string>('');
  const [availability, setAvailability] = useState<Availability | ''>('');
  const [q, setQ] = useState('');

  // Load popular studies on mount
  useEffect(() => {
    fetchPopularStudies();
  }, []);

  // Load studies when filters change
  useEffect(() => {
    searchStudies();
  }, [book, audience, length, availability, q]);

  async function fetchPopularStudies() {
    try {
      const response = await fetch('/api/bible-studies?popular=true');
      const data = await response.json();
      if (data.success) {
        setPopular(data.studies || []);
      }
    } catch (error) {
      console.error('Error fetching popular studies:', error);
    }
  }

  async function searchStudies() {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (book) params.set('book', book);
      if (audience) params.set('audience', audience);
      if (length) params.set('length', length);
      if (availability) params.set('availability', availability);
      if (q) params.set('q', q);

      const response = await fetch(`/api/bible-studies?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setStudies(data.studies || []);
      } else {
        console.error('API error:', data.error);
        setStudies([]);
      }
    } catch (error) {
      console.error('Error searching studies:', error);
      setStudies([]);
    } finally {
      setSearchLoading(false);
      setLoading(false);
    }
  }

  function startStudy(study: Study) {
    alert(`Starting: ${study.title}`);
  }

  // Handle Enter key press in search input
  function handleSearchKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      searchStudies();
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Search for Bible Study</h1>

      {/* Popular row */}
      <section className="card section" aria-label="Popular Bible Studies">
        <h2 className="section-title">Popular Right Now</h2>
        {loading ? (
          <div className="subtitle">Loading popular studies...</div>
        ) : (
          <div className="categories">
            {popular.map(p => (
              <div key={p.id} className="category-card" style={{ flexDirection: 'column', gap: 8 }}>
                <strong>{p.emoji ? `${p.emoji} ` : ''}{p.title}</strong>
                <div className="subtitle">
                  {p.audience === 'family' ? 'Family' : `For: ${p.audience}`}
                  {p.book ? ` • Book: ${p.book}` : ''}
                  {' • '}
                  {p.plan_days} day{p.plan_days > 1 ? 's' : ''}
                  {' • '}
                  {p.availability === 'in-app' ? 'In-app' : 'Purchase'}
                </div>
                <div className="subcategories">
                  <button className="btn btn--xs accent-green" onClick={() => startStudy(p)}>▶</button>
                  <Link className="btn btn--xs" href={
                    p.audience === 'family'
                      ? `/devotion/family-bible-study/family`
                      : `/devotion/family-bible-study/individual`
                  }>
                    Info
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="card section" aria-label="Filters">
        <h2 className="section-title">Filter</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          {/* Book of the Bible */}
          <select className="btn btn--sm" value={book} onChange={e=>setBook(e.target.value)} aria-label="Book of the Bible">
            {BIBLE_BOOKS.map(b => (
              <option key={b || 'any'} value={b}>{b ? `Book: ${b}` : 'Any Book'}</option>
            ))}
          </select>

          {/* Age Group (includes Family) */}
          <select className="btn btn--sm" value={audience} onChange={e=>setAudience(e.target.value as Audience | '')} aria-label="Age Group">
            <option value="">Any Audience</option>
            <option value="family">Family</option>
            <option value="child">Child</option>
            <option value="teen">Teen</option>
            <option value="adult">Adult</option>
          </select>

          {/* Length of Study */}
          <select className="btn btn--sm" value={length} onChange={e=>setLength(e.target.value)} aria-label="Length of Study">
            <option value="">Any Length</option>
            <option value="<=7">≤ 7 days</option>
            <option value="<=14">≤ 14 days</option>
            <option value="<=30">≤ 30 days</option>
            <option value=">30">&gt; 30 days</option>
          </select>

          {/* Availability */}
          <select className="btn btn--sm" value={availability} onChange={e=>setAvailability(e.target.value as Availability | '')} aria-label="Availability">
            <option value="">In-app or Purchase</option>
            <option value="in-app">In-app</option>
            <option value="purchase">Purchase</option>
          </select>

          {/* Free text search */}
          <input
            className="btn btn--sm"
            placeholder="Search by title/keywords…"
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyPress={handleSearchKeyPress}
          />
        </div>
      </section>

      {/* Results */}
      <section className="section" aria-label="Results">
        <h2 className="section-title">Results</h2>
        {searchLoading ? (
          <div className="subtitle">Searching...</div>
        ) : studies.length === 0 ? (
          <div className="subtitle">No studies match your filters.</div>
        ) : (
          <div className="categories">
            {studies.map(s => (
              <div key={s.id} className="category-card" style={{ flexDirection: 'column', gap: 8 }}>
                <strong>{s.emoji ? `${s.emoji} ` : ''}{s.title}</strong>
                <div className="subtitle">
                  {s.audience === 'family' ? 'Family' : `For: ${s.audience}`}
                  {s.book ? ` • Book: ${s.book}` : ''}
                  {' • '}
                  {s.plan_days} day{s.plan_days > 1 ? 's' : ''}
                  {' • '}
                  {s.availability === 'in-app' ? 'In-app' : 'Purchase'}
                </div>
                <div className="subcategories">
                  <button className="btn btn--xs accent-green" onClick={() => startStudy(s)}>▶</button>
                  <Link className="btn btn--xs" href={
                    s.audience === 'family'
                      ? `/devotion/family-bible-study/family`
                      : `/devotion/family-bible-study/individual`
                  }>
                    Info
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}