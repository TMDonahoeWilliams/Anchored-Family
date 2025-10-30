'use client';

import { useRouter } from 'next/navigation';

export default function SelectFamilyBibleStudyPage() {
  const router = useRouter();

  function goToFamilySearch() {
    // Pre-fill query params to default search to "Family" category
    const params = new URLSearchParams({ audience: 'family' });
    router.push(`/devotion/family-bible-study/search?${params.toString()}`);
  }

  return (
    <div className="container">
      <h1 className="page-title">Select Family Bible Study</h1>

      <section className="card section">
        <h2 className="section-title">Find the Perfect Study for Your Family</h2>
        <p className="subtitle" style={{ marginBottom: '1rem' }}>
          Explore a variety of Bible studies designed specifically for families. 
          You can browse popular studies, filter by book of the Bible, or search for specific topics. 
          Click the button below to begin your search with the <strong>Family</strong> category already selected.
        </p>

        <div className="subcategories">
          <button
            className="btn btn--lg accent-green"
            onClick={goToFamilySearch}
          >
            🔍 Search Family Bible Studies
          </button>
        </div>
      </section>
    </div>
  );
}
