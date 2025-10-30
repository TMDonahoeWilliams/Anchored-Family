'use client';

import Link from 'next/link';

export default function FamilyBibleStudyPage() {
  // Example: You could later load selected studies from Supabase
  const currentFamilyStudy = {
    title: 'Gospel of John (30 Days)',
    progress: 'Day 10 of 30',
  };
  const currentIndividualStudy = {
    title: 'Romans for Teens (16 Days)',
    member: 'Mason',
    progress: 'Day 4 of 16',
  };

  return (
    <div className="container">
      <h1 className="page-title">Family Bible Study</h1>

      {/* Current Studies Overview */}
      <section className="card section" id="family-bible-study">
        <h2 className="section-title">Current Family Bible Study</h2>
        {currentFamilyStudy ? (
          <div className="subtitle">
            <strong>{currentFamilyStudy.title}</strong> — {currentFamilyStudy.progress}
          </div>
        ) : (
          <div className="subtitle">No Family Bible Study selected yet.</div>
        )}
        <div className="subcategories" style={{ marginTop: 8 }}>
          <Link href="/devotion/family-bible-study/family" className="btn btn--sm accent-green">
            📚 Select / Manage Family Study
          </Link>
        </div>
      </section>

      <section className="card section" id="individual-bible-study">
        <h2 className="section-title">Current Individual Bible Study</h2>
        {currentIndividualStudy ? (
          <div className="subtitle">
            <strong>{currentIndividualStudy.title}</strong> — {currentIndividualStudy.progress} ({currentIndividualStudy.member})
          </div>
        ) : (
          <div className="subtitle">No Individual Bible Study selected yet.</div>
        )}
        <div className="subcategories" style={{ marginTop: 8 }}>
          <Link href="/devotion/family-bible-study/individual" className="btn btn--sm accent-blue">
            👤 Select / Manage Individual Study
          </Link>
        </div>
      </section>

      {/* Search Bible Studies Button */}
      <section className="card section" id="search-bible-study">
        <h2 className="section-title">Find a New Bible Study</h2>
        <div className="subcategories">
          <Link
            href="/devotion/family-bible-study/search"
            className="btn btn--sm accent-amber"
          >
            🔍 Search for Bible Study
          </Link>
        </div>
      </section>
    </div>
  );
}
