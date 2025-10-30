// app/(app)/budget/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";

const HOUSEHOLD_ID = "demo-household"; // replace with real household/tenant id from your session

type Role = "manager" | "member";

async function getUserAndRole(): Promise<{ userId: string; role: Role }> {
  const supabase = supabaseAdmin;

  // 1) Require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/login"); // not logged in → send to login
  }

  // 2) Load role for this household
  // Adjust table/columns to your schema.
  // Example schema: household_members(id, household_id, user_id, role)
  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", HOUSEHOLD_ID)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr) {
    // If there's a query error, default to member (or handle differently)
    return { userId: user.id, role: "member" };
  }

  // If not found, treat as member
  const role: Role = membership?.role === "manager" ? "manager" : "member";
  return { userId: user.id, role };
}

export default async function BudgetPage() {
  const { role } = await getUserAndRole();
  const isManager = role === "manager";

  const tiles = [
    {
      title: "Goals",
      href: "/budget/goals",
      description: "Create and track savings targets for your family.",
      locked: false,
    },
    {
      title: "Bank Accounts",
      href: "/budget/accounts",
      description: "Connect and manage bank, card, and cash accounts.",
      locked: false,
    },
    {
      title: "Budget Settings",
      href: isManager ? "/budget/settings" : "#",
      description: "Household-wide rules, categories, and permissions.",
      locked: !isManager, // only managers can access
      badge: "Manager only",
    },
    {
      title: "Budgets",
      href: "/budget/budgets",
      description: "Plan monthly envelopes and track spending vs. plan.",
      locked: false,
    },
    {
      title: "Financial Reporting",
      href: "/budget/reports",
      description: "See trends, cash flow, and category breakdowns.",
      locked: false,
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Family Budget</h1>
        <p className="text-sm text-gray-500">
          A private dashboard for your household’s money—only you can see this.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <article
            key={t.title}
            className={`group relative rounded-2xl border p-5 shadow-sm transition hover:shadow ${
              t.locked
                ? "border-gray-200 bg-gray-50 opacity-70"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">{t.title}</h2>
              {t.badge ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {t.badge}
                </span>
              ) : null}
            </div>

            <p className="mb-5 text-sm text-gray-600">{t.description}</p>

            <div className="mt-auto">
              {t.locked ? (
                <button
                  className="w-full cursor-not-allowed rounded-xl border border-gray-300 px-4 py-2 text-center text-sm text-gray-500"
                  aria-disabled
                  title="Only household managers can open Budget Settings"
                >
                  Locked
                </button>
              ) : (
                <Link
                  href={t.href}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Open
                </Link>
              )}
            </div>

            {/* subtle focus ring */}
            <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-indigo-300 transition group-hover:ring-1" />
          </article>
        ))}
      </section>
    </main>
  );
}
