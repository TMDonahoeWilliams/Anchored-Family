import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

export default async function RecipeDetail({ params }: { params: { id: string } }) {
  const { data: r } = await supabase.from('recipes').select('*').eq('id', params.id).maybeSingle();
  if (!r) return <div className="container"><div className="subtitle">Recipe not found.</div></div>;

  return (
    <div className="container">
      <h1 className="page-title">{r.title}</h1>
      <section className="card section">
        {r.cover_url ? <Image src={r.cover_url} alt={r.title} width={800} height={450} style={{ width:'100%', height:'auto', borderRadius:8 }} /> : null}
        {r.summary && <p className="subtitle" style={{ marginTop: 8 }}>{r.summary}</p>}
        {r.ingredients?.length ? (
          <>
            <h2 className="section-title" style={{ marginTop: 16 }}>Ingredients</h2>
            <ul className="subtitle" style={{ marginLeft: 16 }}>
              {r.ingredients.map((i: string, idx: number) => <li key={idx}>• {i}</li>)}
            </ul>
          </>
        ) : null}
        {r.instructions && (
          <>
            <h2 className="section-title" style={{ marginTop: 16 }}>Instructions</h2>
            <pre className="subtitle" style={{ whiteSpace: 'pre-wrap' }}>{r.instructions}</pre>
          </>
        )}
      </section>
    </div>
  );
}
