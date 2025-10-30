import Link from "next/link";

export default function PlannerPage() {
  return (
    <section id="family-planner" className="container card section">
      <h2 className="section-title">Family Planner</h2>
      <div className="subcategories">
        <Link className="btn btn--sm accent-blue"  href="/planner/calendar">📅 Calendar</Link>
        <Link className="btn btn--sm accent-green" href="/planner/chores">🧹 Chores</Link>
        <Link className="btn btn--sm accent-amber" href="/planner/todo">✅ To-Do List</Link>
      </div>
    </section>
  );
}