'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { RecipeCard } from '@/lib/types'

export default function ResultsPage(){
  const [recipes, setRecipes] = useState<RecipeCard[]>([])
  const [query, setQuery] = useState('chicken, rice, spinach')
  const [loading, setLoading] = useState(false)

  async function search(){
    setLoading(true)
    try {
      const res = await fetch(`/api/recipes?ingredients=${encodeURIComponent(query)}`)
      const data = await res.json()
      setRecipes(data.results || [])
    } finally { setLoading(false) }
  }

  useEffect(()=>{ search() },[])

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Recipes by Ingredients</h1>
      <div className="flex gap-2 max-w-2xl">
        <input className="border rounded-md px-3 py-2 w-full" value={query} onChange={e=>setQuery(e.target.value)} />
        <button onClick={search} className="bg-black text-white px-4 rounded-md">Search</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {loading && <div>Loading…</div>}
        {recipes.map(r => (
          <Link key={r.id} href={`/recipe/${r.id}`} className="border rounded-md overflow-hidden hover:shadow">
            <div className="relative w-full h-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={r.title} src={r.image} className="object-cover w-full h-full" />
            </div>
            <div className="p-3 text-sm font-medium">{r.title}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
