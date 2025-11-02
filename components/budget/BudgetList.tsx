'use client';
import React from 'react';

type BudgetItem = { id?: string; name: string; amount: number };
type Budget = { id: string; household_id?: string; name: string; budget_items?: BudgetItem[] };

export default function BudgetList({ budgets, onUpdated }: { budgets: Budget[]; onUpdated?: () => void }) {
  if (!budgets || budgets.length === 0) {
    return <div>No budgets yet.</div>;
  }

  async function handleDelete(budgetId: string) {
    if (!confirm('Delete this budget?')) return;
    try {
      const res = await fetch(`/api/budget?id=${encodeURIComponent(budgetId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(json?.error || res.statusText);
      }
      onUpdated?.();
    } catch (err: any) {
      alert('Failed to delete: ' + String(err.message ?? err));
    }
  }

  return (
    <div>
      {budgets.map((b) => (
        <div key={b.id} style={{ border: '1px solid #ddd', padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{b.name}</strong>
              <div style={{ fontSize: 13, color: '#666' }}>Items: {b.budget_items?.length ?? 0}</div>
            </div>
            <div>
              <button onClick={() => handleDelete(b.id)}>Delete</button>
            </div>
          </div>

          {b.budget_items && b.budget_items.length > 0 && (
            <ul style={{ marginTop: 8 }}>
              {b.budget_items.map((it) => (
                <li key={it.id}>
                  {it.name} — ${Number(it.amount).toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
