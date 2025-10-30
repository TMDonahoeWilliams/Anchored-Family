'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseServer'

type PantryItem = {
  id: string;
  household_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  updated_at: string;
};

type RecipeCard = {
  id: number;
  title: string;
  image: string;
};

export default function PantryPage() {
  // Pantry
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [qty, setQty] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [search, setSearch] = useState('');

  // Recipes
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && data) setItems(data as PantryItem[]);
      setLoading(false);
    })();
  }, []);

  async function addManual() {
    const clean = name.trim();
    if (!clean) return alert('Enter an item name');
    const q = qty ? Number(qty) : null;
    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ name: clean, quantity: isNaN(q as any) ? null : q, unit: unit || null, household_id: '550e8400-e29b-41d4-a716-446655440000' })
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(prev => [data as PantryItem, ...prev]);
    setName(''); setQty(''); setUnit('');
  }

  async function deleteItem(id: string) {
    await supabase.from('pantry_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function bumpQty(row: PantryItem, delta: number) {
    const next = (row.quantity || 0) + delta;
    const { data, error } = await supabase
      .from('pantry_items')
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(prev => prev.map(i => (i.id === row.id ? (data as PantryItem) : i)));
  }

  const handleOCRPhoto = async () => {
    if (!photo) return alert('Pick a photo first');
    const fd = new FormData();
    fd.append('file', photo);
    fd.append('household_id', '550e8400-e29b-41d4-a716-446655440000');
    const r = await fetch('/table/pantry/ocr', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'OCR failed');
    // Merge newly created items (server returns inserted rows or names)
    if (Array.isArray(j.inserted)) {
      setItems(prev => [...j.inserted, ...prev]);
    }
    alert(`Added ${j.created || 0} items from photo`);
    setPhoto(null);
  };

  // Filtered + simple sort
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = s ? items.filter(i => i.name.toLowerCase().includes(s)) : items;
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search]);

  // Build ingredients list for recipe idea query
  function ingredientsFromPantry(limit = 8) {
    const top = filtered.slice(0, limit);
    return top.map(i => i.name).join(', ');
  }

  async function fetchRecipes() {
    const ingredients = ingredientsFromPantry();
    if (!ingredients) {
      setRecipes([]);
      return;
    }
    setRecipesLoading(true);
    try {
      const r = await fetch(`/api/recipes?ingredients=${encodeURIComponent(ingredients)}`);
      const j = await r.json();
      const cards: RecipeCard[] = (j.results || []).map((x: any) => ({
        id: x.id, title: x.title, image: x.image
      }));
      setRecipes(cards);
    } finally {
      setRecipesLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Pantry</h1>
          <div className="subtitle">Add items manually or from a photo, then get recipe ideas.</div>
        </div>
        <span className="pill">v0.1</span>
      </header>

      {/* Add row */}
      <section className="card section">
        <h2 className="section-title">Add Items</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <input className="btn btn--sm" placeholder="Item name (e.g., chicken)"
                 value={name} onChange={e=>setName(e.target.value)} />
          <input className="btn btn--sm" placeholder="Qty" inputMode="decimal"
                 value={qty} onChange={e=>setQty(e.target.value)} />
          <input className="btn btn--sm" placeholder="Unit (e.g., lbs, cans)"
                 value={unit} onChange={e=>setUnit(e.target.value)} />
          <button className="btn btn--sm accent-green" onClick={addManual}>➕ Add</button>

          <input type="file" accept="image/*" className="btn btn--sm"
                 onChange={e=>setPhoto(e.target.files?.[0] || null)} />
          <button className="btn btn--sm accent-amber" onClick={handleOCRPhoto}>📷 Add from Photo</button>
        </div>
        <div className="subcategories">
          <input className="btn btn--sm" placeholder="Search pantry…" value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn--sm accent-blue" onClick={fetchRecipes}>🍽️ Get Recipe Ideas</button>
        </div>
      </section>

      {/* Organized pantry table */}
      <section className="card section">
        <h2 className="section-title">Inventory</h2>
        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="subtitle">No items found. Add some above.</div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px' }}>Item</th>
                  <th style={{ padding: '6px', width: '90px' }}>Qty</th>
                  <th style={{ padding: '6px', width: '60px' }}>Unit</th>
                  <th style={{ padding: '6px', width: '80px' }}>Updated</th>
                  <th style={{ padding: '6px', width: '70px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                    <td style={{ padding: '6px', fontSize: '0.9rem' }}>{row.name}</td>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap', width: '90px', fontSize: '0.85rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button 
                          className="btn btn--sm" 
                          onClick={() => bumpQty(row, -1)} 
                          style={{ 
                            fontSize: '0.7rem', 
                            padding: '1px 3px', 
                            minWidth: '18px', 
                            height: '18px',
                            lineHeight: '1'
                          }}
                        >－</button>
                        <span style={{ minWidth: '16px', display: 'inline-block', margin: '0 2px', textAlign: 'center' }}>{row.quantity ?? '—'}</span>
                        <button 
                          className="btn btn--sm" 
                          onClick={() => bumpQty(row, 1)}
                          style={{ 
                            fontSize: '0.7rem', 
                            padding: '1px 3px', 
                            minWidth: '18px', 
                            height: '18px',
                            lineHeight: '1'
                          }}
                        >＋</button>
                      </div>
                    </td>
                    <td style={{ padding: '6px', width: '60px', fontSize: '0.85rem' }}>{row.unit ?? '—'}</td>
                    <td style={{ padding: '6px', width: '80px', fontSize: '0.75rem' }}>
                      {new Date(row.updated_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px', width: '70px' }}>
                      <button 
                        className="btn btn--sm accent-rose" 
                        onClick={() => deleteItem(row.id)}
                        style={{ fontSize: '0.75rem', padding: '3px 6px' }}
                      >Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recipe ideas */}
      <section className="card section">
        <h2 className="section-title">Recipe Ideas</h2>
        {recipesLoading ? (
          <div className="subtitle">Finding ideas…</div>
        ) : recipes.length === 0 ? (
          <div className="subtitle">No ideas yet. Click “Get Recipe Ideas”.</div>
        ) : (
          <div className="categories" aria-label="Recipes">
            {recipes.map(r => (
              <a key={r.id} className="btn" href={`/recipe/${r.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt={r.title} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                <span style={{ textAlign: 'left' }}>{r.title}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}