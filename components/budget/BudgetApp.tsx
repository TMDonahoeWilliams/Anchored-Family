'use client';
import React, { useEffect, useState } from 'react';
import BudgetList from './BudgetList';

type BudgetItem = { id?: string; name: string; amount: number };
type Budget = { id: string; household_id?: string; name: string; budget_items?: BudgetItem[] };

export default function BudgetApp({ initialBudgets = [], householdId }: { initialBudgets?: Budget[]; householdId: string }) {
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget?householdId=${encodeURIComponent(householdId)}`, { cache: 'no-store' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(json?.error || res.statusText);
      }
      const json = await res.json();
      setBudgets(json.budgets ?? []);
    } catch (err: any) {
      setError(String(err.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // If the server provided initial data, keep it; otherwise fetch
    if (!initialBudgets || initialBudgets.length === 0) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, name: newName }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(json?.error || res.statusText);
      }
      setNewName('');
      await refresh();
    } catch (err: any) {
      setError(String(err.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New budget name" />
        <button onClick={handleCreate} disabled={loading || !newName.trim()} style={{ marginLeft: 8 }}>
          Create
        </button>
        <button onClick={refresh} disabled={loading} style={{ marginLeft: 8 }}>
          Refresh
        </button>
      </div>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      {loading && <div>Loading…</div>}

      <BudgetList budgets={budgets} onUpdated={refresh} />
    </div>
  );
}
