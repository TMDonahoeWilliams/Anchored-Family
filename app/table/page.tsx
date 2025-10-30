import Link from "next/link";

export default function TablePage() {
  return (
    <section id="family-table" className="container card section">
      <h2 className="section-title">Family Table</h2>
      <div className="subcategories">
        <Link className="btn btn--sm accent-rose"   href="/table/pantry">🥫 Pantry</Link>
        <Link className="btn btn--sm accent-violet" href="/table/recipes">📖 Recipes</Link>
        <Link className="btn btn--sm accent-amber"  href="/table/grocery">🧺 Grocery List</Link>
      </div>
    </section>
  );
}