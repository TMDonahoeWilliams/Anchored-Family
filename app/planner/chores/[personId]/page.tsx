"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Chore = { id: string; name: string };
type Assignment = {
  id: string; chore_id: string; frequency: string; active: boolean;
  chore?: Chore;
};
type LogRow = { id: string; assignment_id: string; completed_at: string };

const DEFAULT_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Custom"];

export default function PersonChoresPage() {
  const params = useParams<{ personId: string }>();
  const personId = params.personId;

  const [personName, setPersonName] = useState<string>("Person");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [selectedChore, setSelectedChore] = useState<string>("");
  const [newChoreName, setNewChoreName] = useState("");
  const [frequency, setFrequency] = useState("Weekly");

  useEffect(() => {
    if (!personId) return;
    (async () => {
      const { data: p } = await supabase.from("people").select("*").eq("id", personId).single();
      if (p) setPersonName(p.name);

      const { data: c } = await supabase.from("chores").select("*").order("name");
      setChores(c || []);

      const { data: a } = await supabase
        .from("chore_assignments")
        .select("*, chore:chores(*)")
        .eq("person_id", personId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      setAssignments(a || []);

      const from = new Date(); from.setDate(from.getDate() - 31);
      const { data: l } = await supabase
        .from("chore_logs")
        .select("*")
        .gte("completed_at", from.toISOString())
        .order("completed_at", { ascending: false });
      setLogs(l || []);
    })();
  }, [personId]);

  const completedCount = useMemo(() => {
    const ids = new Set(assignments.map(a => a.id));
    return logs.filter(l => ids.has(l.assignment_id)).length;
  }, [assignments, logs]);

  async function markComplete(assignmentId: string) {
    const { error } = await supabase.from("chore_logs").insert({ assignment_id: assignmentId });
    if (error) return alert(error.message);
    setLogs(prev => [{ id: crypto.randomUUID(), assignment_id: assignmentId, completed_at: new Date().toISOString() }, ...prev]);
  }

  async function addAssignment() {
    if (!selectedChore) return alert("Pick a chore");
    let choreId = selectedChore;

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
      person_id: personId,
      chore_id: choreId,
      frequency
    });
    if (insErr) return alert(insErr.message);

    const { data: a } = await supabase
      .from("chore_assignments")
      .select("*, chore:chores(*)")
      .eq("person_id", personId)
      .eq("active", true)
      .order("created_at", { ascending: false });
    setAssignments(a || []);
  }

  return (
    <div className="container">
      <section className="card section">
        <h2 className="section-title">Chores for {personName}</h2>
        <p className="subtitle">Completed in last 30 days: <strong>{completedCount}</strong></p>
      </section>

      <section className="card section">
        <h3 className="section-title">Assigned</h3>
        <div className="subcategories">
          {assignments.map(a => (
            <div key={a.id} className="btn btn--sm" style={{ justifyContent: "space-between" }}>
              <span>{a.chore?.name || "Chore"} • {a.frequency}</span>
              <button className="btn btn--sm accent-green" onClick={() => markComplete(a.id)}>✔ Mark Done</button>
            </div>
          ))}
          {assignments.length === 0 && <div className="subtitle">No chores assigned yet.</div>}
        </div>
      </section>

      <section className="card section">
        <h3 className="section-title">Add Chore</h3>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <select className="btn btn--sm" value={selectedChore} onChange={e=>setSelectedChore(e.target.value)}>
            <option value="">Select chore…</option>
            {chores.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="new">➕ Add New…</option>
          </select>
          <select className="btn btn--sm" value={frequency} onChange={e=>setFrequency(e.target.value)}>
            {DEFAULT_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button className="btn btn--sm accent-amber" onClick={addAssignment}>Assign</button>
        </div>

        {selectedChore === "new" && (
          <div className="subcategories">
            <input
              className="btn btn--sm"
              placeholder="New chore name"
              value={newChoreName}
              onChange={e=>setNewChoreName(e.target.value)}
            />
          </div>
        )}
      </section>
    </div>
  );
}