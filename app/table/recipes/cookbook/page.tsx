'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

type Recipe = {
  id: string;
  household_id: string;
  title: string;
  summary?: string | null;
  ingredients?: string[] | null;
  instructions?: string | null;
  cover_url?: string | null;
  source?: string | null; // 'manual' | 'ocr' | 'spoonacular'
  created_at: string;
  favorite?: boolean; // view-level flag (joined)
};

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: replace with session context

export default function RecipesPage() {
  const [tab, setTab] = useState<'cookbook' | 'search'>('cookbook');

  // Cookbook state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingCookbook, setLoadingCookbook] = useState(true);
  const [qCookbook, setQCookbook] = useState('');

  // Manual add
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [ingredients, setIngredients] = useState(''); // newline separated
  const [instructions, setInstructions] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Search (Spoonacular)
  const [q, setQ] = useState('');
  const [diet, setDiet] = useState('');
  const [maxReadyMinutes, setMaxReadyMinutes] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingCookbook(true);
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        setRecipes([]);
      } else {
        setRecipes((data || []) as Recipe[]);
      }
      setLoadingCookbook(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!qCookbook.trim()) return recipes;
    const s = qCookbook.toLowerCase();
    return recipes.filter(r =>
      r.title.toLowerCase().includes(s) ||
      (r.summary || '').toLowerCase().includes(s) ||
      (r.ingredients || []).some(i => i.toLowerCase().includes(s))
    );
  }, [qCookbook, recipes]);

  async function addManual() {
    if (!title.trim()) return alert('Title is required');
    // optional: upload image first
    let cover_url: string | null = null;
    if (file) {
      const key = `${HOUSEHOLD_ID}/recipes/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('recipes').upload(key, file, { upsert: false });
      if (upErr) return alert(upErr.message);
      const { data: pub } = await supabase.storage.from('recipes').getPublicUrl(key);
      cover_url = pub?.publicUrl ?? null;
    }
    const ing = ingredients
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const { data, error } = await supabase
      .from('recipes')
      .insert({
        household_id: HOUSEHOLD_ID,
        title: title.trim(),
        summary: summary || null,
        ingredients: ing.length ? ing : null,
        instructions: instructions || null,
        source: 'manual',
        cover_url
      })
      .select()
      .single();
    if (error) return alert(error.message);

    setRecipes(prev => [data as Recipe, ...prev]);
    setTitle(''); setSummary(''); setIngredients(''); setInstructions(''); setFile(null);
    alert('Recipe added to My Cookbook.');
  }

  async function addFromPhoto() {
    if (!file) return alert('Choose a recipe image first.');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('household_id', HOUSEHOLD_ID);
    const r = await fetch('/api/recipes/ocr', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'OCR failed');
    // API returns the created recipe row
    setRecipes(prev => [j.recipe, ...prev]);
    setFile(null);
    alert('Recipe created from photo.');
  }

  async function searchRecipes() {
    setLoadingSearch(true);
    try {
      const url = new URL('/api/recipes/search', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (diet) url.searchParams.set('diet', diet);
      if (maxReadyMinutes) url.searchParams.set('maxReadyMinutes', maxReadyMinutes);
      const r = await fetch(url.toString());
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Search failed');
      setResults(j.results || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingSearch(false);
    }
  }

  async function saveFromSpoonacular(spoonId: number) {
    const r = await fetch(`/api/recipes/search?id=${spoonId}`);
    const j = await r.json();
    if (!r.ok) return alert(j.error || 'Failed to load recipe details');
    const { title, summary, extendedIngredients, instructions, image, sourceUrl } = j.recipe;

    const ing = (extendedIngredients || []).map((i: any) => i.original || '').filter(Boolean);

    const { data, error } = await supabase
      .from('recipes')
      .insert({
        household_id: HOUSEHOLD_ID,
        title,
        summary: summary ? summary.replace(/<[^>]+>/g, '') : null,
        ingredients: ing.length ? ing : null,
        instructions: instructions || null,
        cover_url: image || null,
        source: 'spoonacular',
      })
      .select()
      .single();
    if (error) return alert(error.message);
    setRecipes(prev => [data as Recipe, ...prev]);
    alert('Saved to My Cookbook.');
  }

  return (
    <div className="container">
      <h1 className="page-title">Family Table — Recipes</h1>

      {/* Tabs */}
      <nav className="categories" style={{ marginBottom: 8 }}>
        <button className={`btn ${tab === 'cookbook' ? 'accent-green' : ''}`} onClick={() => setTab('cookbook')}>📖 My Cookbook</button>
        <button className={`btn ${tab === 'search' ? 'accent-blue' : ''}`} onClick={() => setTab('search')}>🔎 Search Recipes</button>
      </nav>

      {/* ========== COOKBOOK ========== */}
      {tab === 'cookbook' && (
        <>
          {/* Add new */}
          <section className="card section">
            <h2 className="section-title">Add a Recipe</h2>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Title *" value={title} onChange={e=>setTitle(e.target.value)} />
              <input className="btn btn--sm" placeholder="Short summary (optional)" value={summary} onChange={e=>setSummary(e.target.value)} />
              <input type="file" className="btn btn--sm" onChange={e=>setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <textarea className="btn btn--sm" placeholder="Ingredients (one per line)" value={ingredients} onChange={e=>setIngredients(e.target.value)} />
              <textarea className="btn btn--sm" placeholder="Instructions" value={instructions} onChange={e=>setInstructions(e.target.value)} />
            </div>
            <div className="subcategories">
              <button className="btn btn--lg accent-green" onClick={addManual}>➕ Save Manually</button>
              <button className="btn btn--lg accent-amber" onClick={addFromPhoto}>📷 Create from Photo</button>
            </div>
          </section>

          {/* Manage / Filter */}
          <section className="card section">
            <h2 className="section-title">My Cookbook</h2>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Search in My Cookbook…" value={qCookbook} onChange={e=>setQCookbook(e.target.value)} />
              <Link href="/table/pantry" className="btn btn--sm">🥫 Check Pantry</Link>
              <Link href="/table/grocery" className="btn btn--sm accent-cyan">🧾 Grocery List</Link>
            </div>

            {loadingCookbook ? (
              <div className="subtitle">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="subtitle">No recipes yet.</div>
            ) : (
              <div className="categories">
                {filtered.map(r => (
                  <article key={r.id} className="category-card" style={{ flexDirection:'column', gap:8 }}>
                    {r.cover_url ? (
                      <Image src={r.cover_url} alt={r.title} width={640} height={360} style={{ width:'100%', height:'auto', borderRadius:8 }} />
                    ) : null}
                    <strong>{r.title}</strong>
                    {r.summary && <div className="subtitle">{r.summary}</div>}
                    {r.ingredients?.length ? (
                      <div className="subtitle">Ingredients: {r.ingredients.slice(0,5).join(', ')}{r.ingredients.length>5?'…':''}</div>
                    ) : null}
                    <div className="subcategories">
                      <Link className="btn btn--sm accent-blue" href={`/table/recipes/${r.id}`}>View Recipe</Link>
                      <Link className="btn btn--sm" href={`/planner/calendar`}>🗓️ Add to Calendar</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ========== SEARCH ========== */}
      {tab === 'search' && (
        <>
          <section className="card section">
            <h2 className="section-title">Search Recipes (Spoonacular)</h2>
            <div className="subcategories" style={{ marginBottom: 8 }}>
              <input className="btn btn--sm" placeholder="Search (e.g., chicken tacos)" value={q} onChange={e=>setQ(e.target.value)} />
              <select className="btn btn--sm" value={diet} onChange={e=>setDiet(e.target.value)}>
                <option value="">Any Diet</option>
                <option value="gluten free">Gluten Free</option>
                <option value="ketogenic">Ketogenic</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="paleo">Paleo</option>
              </select>
              <input className="btn btn--sm" placeholder="Max minutes (e.g., 30)" value={maxReadyMinutes} onChange={e=>setMaxReadyMinutes(e.target.value)} />
              <button className="btn btn--sm accent-blue" onClick={searchRecipes} disabled={loadingSearch}>{loadingSearch ? 'Searching…' : 'Search'}</button>
            </div>
            <div className="subtitle">Tip: results come from the Spoonacular API (set your key in <code>.env.local</code>).</div>
          </section>

          <section className="card section">
            <h2 className="section-title">Results</h2>
            {loadingSearch ? (
              <div className="subtitle">Loading…</div>
            ) : results.length === 0 ? (
              <div className="subtitle">No matches yet.</div>
            ) : (
              <div className="categories">
                {results.map((r:any) => (
                  <article key={r.id} className="category-card" style={{ flexDirection:'column', gap:8 }}>
                    {r.image ? <Image src={r.image} alt={r.title} width={640} height={360} style={{ width:'100%', height:'auto', borderRadius:8 }} /> : null}
                    <strong>{r.title}</strong>
                    <div className="subtitle">Ready in {r.readyInMinutes ?? '—'} min • Servings {r.servings ?? '—'}</div>
                    <div className="subcategories">
                      <button className="btn btn--sm accent-green" onClick={() => saveFromSpoonacular(r.id)}>➕ Save to My Cookbook</button>
                      <Link className="btn btn--sm" href={`/table/recipes/spoon/${r.id}`}>Details</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
