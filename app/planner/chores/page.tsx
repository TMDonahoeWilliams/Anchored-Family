"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Person = { id: string; name: string };
type Chore = { id: string; name: string };
type AssignmentRow = {
  id: string; person_id: string; chore_id: string; frequency: string; active: boolean;
  chore?: Chore; person?: Person;
};
type LogRow = { id: string; assignment_id: string; completed_at: string };

const DEFAULT_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Custom"];

export default function ChoresDashboard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  // Add Assignment form state
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [selectedChore, setSelectedChore] = useState<string>(""); // chore_id OR "new"
  const [newChoreName, setNewChoreName] = useState("");
  const [frequency, setFrequency] = useState<string>("Weekly");

  // Load data
  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("people").select("*").order("created_at", { ascending: true });
      setPeople(p || []);

      const { data: c } = await supabase.from("chores").select("*").order("name", { ascending: true });
      setChores(c || []);

      const { data: a } = await supabase
        .from("chore_assignments")
        .select("*, chore:chores(*), person:people(*)")
        .eq("active", true)
        .order("created_at", { ascending: false });
      setAssignments(a || []);

      // pull recent logs (last 31 days)
      const from = new Date();
      from.setDate(from.getDate() - 31);
      const { data: l } = await supabase
        .from("chore_logs")
        .select("*")
        .gte("completed_at", from.toISOString())
        .order("completed_at", { ascending: false });
      setLogs(l || []);
    })();
  }, []);

  // Dashboard aggregates
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay()); // Sunday start
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedToday = logs.filter(l => new Date(l.completed_at) >= startOfToday).length;
  const completedThisWeek = logs.filter(l => new Date(l.completed_at) >= startOfWeek).length;
  const completedThisMonth = logs.filter(l => new Date(l.completed_at) >= startOfMonth).length;

  const assignmentsPerPerson = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of assignments) map[a.person_id] = (map[a.person_id] || 0) + 1;
    return map;
  }, [assignments]);

  async function handleAddAssignment() {
    if (!selectedPerson) return alert("Pick a person");
    if (!selectedChore) return alert("Pick a chore");
    if (!frequency) return alert("Pick a frequency");

    let choreId = selectedChore;

    // If "Add New" selected, insert new chore first
    if (selectedChore === "new") {
      const name = newChoreName.trim();
      if (!name) return alert("Enter a new chore name");
      const { data, error } = await supabase.from("chores").insert({ name }).select().single();
      if (error || !data) return alert(error?.message || "Failed to add new chore");
      choreId = data.id;
      setChores(prev => [...prev, data]);
      setSelectedChore(data.id);
      setNewChoreName("");
    }

    const { error: insErr } = await supabase.from("chore_assignments").insert({
      person_id: selectedPerson,
      chore_id: choreId,
      frequency,
    });
    if (insErr) return alert(insErr.message);

    // refresh assignments
    const { data: a } = await supabase
      .from("chore_assignments")
      .select("*, chore:chores(*), person:people(*)")
      .eq("active", true)
      .order("created_at", { ascending: false });
    setAssignments(a || []);
    alert("Assignment added!");
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="title">Family Chores</h1>
          <div className="subtitle">Assign, track, and celebrate progress</div>
        </div>
        <span className="pill">v0.1</span>
      </header>

      {/* Summary cards */}
      <section className="categories" aria-label="Summary">
        <div className="card"><strong>Completed Today</strong><div style={{ fontSize: 24 }}>{completedToday}</div></div>
        <div className="card"><strong>This Week</strong><div style={{ fontSize: 24 }}>{completedThisWeek}</div></div>
        <div className="card"><strong>This Month</strong><div style={{ fontSize: 24 }}>{completedThisMonth}</div></div>
      </section>

      {/* People grid */}
      <section className="card section">
        <h2 className="section-title">People</h2>
        <div className="subcategories" style={{ marginTop: 8 }}>
          {people.map(p => (
            <Link key={p.id} className="btn btn--sm accent-blue" href={`/planner/chores/${p.id}`}>
              👤 {p.name} {assignmentsPerPerson[p.id] ? `• ${assignmentsPerPerson[p.id]} chores` : ""}
            </Link>
          ))}
        </div>
      </section>

      {/* Add Assignment */}
      <section className="card section">
        <h2 className="section-title">Assign a Chore</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          {/* Person */}
          <select className="btn btn--sm" value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)}>
            <option value="">Select person…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Chore */}
          <select className="btn btn--sm" value={selectedChore} onChange={e=>setSelectedChore(e.target.value)}>
            <option value="">Select chore…</option>
            {chores.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="new">➕ Add New…</option>
          </select>

          {/* Frequency */}
          <select className="btn btn--sm" value={frequency} onChange={e=>setFrequency(e.target.value)}>
            {DEFAULT_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <button className="btn btn--sm accent-green" onClick={handleAddAssignment}>Assign</button>
        </div>

        {/* Show this input only when adding a new chore */}
        {selectedChore === "new" && (
          <div className="subcategories" style={{ marginTop: 8 }}>
            <input
              className="btn btn--sm"
              placeholder="New chore name (e.g., Take out trash)"
              value={newChoreName}
              onChange={e=>setNewChoreName(e.target.value)}
            />
          </div>
        )}
      </section>
    </div>
  );
}