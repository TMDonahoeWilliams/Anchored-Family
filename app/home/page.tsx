// app/dashboard/page.tsx
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="container">
      {/* Black page title under brand bar */}
      <h1 className="page-title">Anchored Family</h1>

      {/* Categories grid — each button inside a boxed card */}
      <nav className="categories" aria-label="Main sections">
        <div className="category-card">
          <Link className="btn accent-blue" href="/planner">🗓️ Family Planner</Link>
        </div>
        <div className="category-card">
          <Link className="btn accent-amber" href="/table">🍽️ Family Table</Link>
        </div>
        <div className="category-card">
          <Link className="btn accent-violet" href="/vault">🔐 Family Vault</Link>
        </div>
        <div className="category-card">
          <Link className="btn accent-green" href="/devotion">📖 Family Devotion</Link>
        </div>
        <div className="category-card">
          <Link className="btn accent-magenta" href="/budget">💰 Family Budget</Link>
        </div>
        <div className="category-card">
          <Link className="btn accent-cyan" href="/account">👤 Account</Link>
        </div>
      </nav>

      {/* Example section using your card/section styles (optional) */}
      <section id="family-table" className="card section">
        <h2 className="section-title">Quick Start</h2>
        <div className="subcategories">
          <Link className="btn btn--sm accent-amber" href="/table/pantry">🥫 Pantry</Link>
          <Link className="btn btn--sm accent-amber" href="/table/recipes">🍳 Recipes</Link>
          <Link className="btn btn--sm accent-amber" href="/table/grocery">🛒 Grocery</Link>
        </div>
      </section>
    </div>
  )
}