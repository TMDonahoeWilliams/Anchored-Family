'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type GroceryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  is_done: boolean;
  is_favorite: boolean;
  source: string | null;       // e.g. 'manual', 'recipe:123', 'voice', 'camera', 'instacart'
  added_at: string;
};

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-item state
  const [name, setName] = useState('');
  const [qty, setQty] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  // Voice
  const recRef = useRef<any>(null);
  const [recognizing, setRecognizing] = useState(false);

  const done = items.filter(i => i.is_done).length;
  const total = items.length;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('grocery_items')
        .select('*')
        .order('is_done', { ascending: true })
        .order('added_at', { ascending: false });
      setItems((data || []) as GroceryItem[]);
      setLoading(false);
    })();
  }, []);

  async function refresh() {
    const { data } = await supabase
      .from('grocery_items')
      .select('*')
      .order('is_done', { ascending: true })
      .order('added_at', { ascending: false });
    setItems((data || []) as GroceryItem[]);
  }

  async function addManual(source = 'manual') {
    const clean = name.trim();
    if (!clean) return alert('Enter an item name');
    const q = qty ? Number(qty) : null;
    const { data, error } = await supabase
      .from('grocery_items')
      .insert({ name: clean, quantity: isNaN(q as any) ? null : q, unit: unit || null, is_done: false, is_favorite: false, source })
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(prev => [data as GroceryItem, ...prev]);
    setName(''); setQty(''); setUnit('');
  }

  async function addFromPhoto() {
    if (!photo) return alert('Pick a photo first');
    const fd = new FormData();
    fd.append('file', photo);
    const r = await fetch('/api/grocery/ocr', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'OCR failed');
    // j.inserted contains newly added rows
    setItems(prev => [...(j.inserted || []), ...prev]);
    alert(`Added ${j.created || 0} items from photo`);
    setPhoto(null);
  }

  function startVoice() {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return alert('Speech recognition not supported in this browser.');
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = async (e: any) => {
      const text: string = e.results[0][0].transcript;
      setRecognizing(false);
      setName(text);
      // Auto-add, or let user edit first; here we auto-add:
      setTimeout(() => addManual('voice'), 0);
    };
    rec.onend = () => setRecognizing(false);
    rec.onerror = () => setRecognizing(false);
    recRef.current = rec;
    setRecognizing(true);
    rec.start();
  }

  async function toggleDone(id: string, is_done: boolean) {
    const { error } = await supabase.from('grocery_items').update({ is_done: !is_done }).eq('id', id);
    if (error) return alert(error.message);
    setItems(prev => prev.map(i => (i.id === id ? { ...i, is_done: !is_done } : i)));
  }

  async function toggleFavorite(id: string, is_favorite: boolean) {
    const { error } = await supabase.from('grocery_items').update({ is_favorite: !is_favorite }).eq('id', id);
    if (error) return alert(error.message);
    setItems(prev => prev.map(i => (i.id === id ? { ...i, is_favorite: !is_favorite } : i)));
  }

  async function remove(id: string) {
    await supabase.from('grocery_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const favorites = useMemo(() => items.filter(i => i.is_favorite && !i.is_done), [items]);
  const active = useMemo(() => items.filter(i => !i.is_done), [items]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Grocery List</h1>
          <div className="subtitle">Add by typing, voice, or photo. Check off as you shop.</div>
        </div>
        <span className="pill">v0.1</span>
      </header>

      {/* Dashboard */}
      <section className="categories" aria-label="Summary">
        <div className="card"><strong>Items</strong><div style={{ fontSize: 24 }}>{total}</div></div>
        <div className="card"><strong>Remaining</strong><div style={{ fontSize: 24 }}>{active.length}</div></div>
        <div className="card"><strong>Favorites</strong><div style={{ fontSize: 24 }}>{favorites.length}</div></div>
      </section>

      {/* Connect shopping providers */}
      <section className="card section">
        <h2 className="section-title">Shop Online</h2>
        <div className="subcategories">
          <a className="btn btn--sm accent-green" href="https://www.instacart.com" target="_blank">🛒 Connect Instacart</a>
          <a className="btn btn--sm accent-blue" href="https://www.walmart.com/grocery" target="_blank">🛒 Walmart</a>
          <a className="btn btn--sm accent-cyan" href="https://www.heb.com/shop" target="_blank">🛒 H-E-B</a>
          {/* Future: use OAuth + carts API/webhooks to auto-mark purchased */}
        </div>
      </section>

      {/* Add items */}
      <section className="card section">
        <h2 className="section-title">Add Items</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <input className="btn btn--sm" placeholder="Item name" value={name} onChange={e=>setName(e.target.value)} />
          <input className="btn btn--sm" placeholder="Qty" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)} />
          <input className="btn btn--sm" placeholder="Unit" value={unit} onChange={e=>setUnit(e.target.value)} />
          <button className="btn btn--sm accent-green" onClick={() => addManual('manual')}>➕ Add</button>

          <button className="btn btn--sm accent-blue" onClick={startVoice}>
            {recognizing ? '🎙️ Listening…' : '🎤 Voice Add'}
          </button>

          <input type="file" accept="image/*" className="btn btn--sm" onChange={e=>setPhoto(e.target.files?.[0] || null)} />
          <button className="btn btn--sm accent-amber" onClick={addFromPhoto}>📷 Add from Photo</button>
        </div>

        {/* Quick add favorites */}
        {favorites.length > 0 && (
          <>
            <h3 className="section-title" style={{ marginTop: 6 }}>Quick Add (Favorites)</h3>
            <div className="subcategories">
              {favorites.map(f => (
                <button
                  key={f.id}
                  className="btn btn--sm"
                  onClick={() => {
                    setName(f.name);
                    setQty(String(f.quantity ?? ''));
                    setUnit(f.unit ?? '');
                    addManual('favorite');
                  }}
                >
                  ⭐ {f.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Active items */}
      <section className="card section">
        <h2 className="section-title">List</h2>
        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : active.length === 0 ? (
          <div className="subtitle">Nothing to buy right now.</div>
        ) : (
          <ul>
            {active.map(i => (
              <li key={i.id} className="card" style={{ margin: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{i.name}</strong>
                  <div className="subtitle">
                    {(i.quantity ?? '—')}{i.unit ? ` ${i.unit}` : ''} {i.source ? `• ${i.source}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn--sm" onClick={() => toggleFavorite(i.id, i.is_favorite)}>{i.is_favorite ? '★' : '☆'}</button>
                  <button className="btn btn--sm accent-green" onClick={() => toggleDone(i.id, i.is_done)}>✔</button>
                  <button className="btn btn--sm accent-rose" onClick={() => remove(i.id)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Purchased items (collapsed simple view) */}
      {items.some(i => i.is_done) && (
        <section className="card section">
          <h2 className="section-title">Purchased</h2>
          <ul>
            {items.filter(i => i.is_done).map(i => (
              <li key={i.id} className="subtitle">{i.name} • {new Date(i.added_at).toLocaleDateString()}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
