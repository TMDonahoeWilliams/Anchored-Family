import Link from "next/link";

export default function DevotionPage() {
  return (
    <section id="family-devotion" className="container card section">
      <h2 className="section-title">Family Devotion</h2>
      <div className="subcategories">
        <Link className="btn btn--sm accent-green"  href="/devotion/family-bible-study">👨‍👩‍👧‍👦 Family Bible Study</Link>
        <Link className="btn btn--sm accent-blue"   href="/devotion/bible-in-a-year">📆 Bible in a Year</Link>
        <Link className="btn btn--sm accent-rose"   href="/devotion/todays-scripture">📜 Today’s Scripture</Link>
        <Link className="btn btn--sm accent-violet" href="/devotion/reading-list">📚 Reading List</Link>
      </div>
    </section>
  );
}