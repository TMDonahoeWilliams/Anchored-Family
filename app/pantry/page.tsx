'use client'
import { useEffect, useState } from 'react'
import IngredientInput from '@/components/IngredientInput'
import { supabaseAdmin } from '@/lib/supabaseServer'
import type { PantryItem } from '@/lib/types'

export default function PantryPage(){
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabaseAdmin.from('pantry_items').select('*').order('updated_at', { ascending: false })
      if(!error && data) setItems(data as PantryItem[])
      setLoading(false)
    }
    load()
  }, [])

  async function addItem(name: string){
    const { data, error } = await supabaseAdmin.from('pantry_items')
      .insert({ name, quantity: null, unit: null, household_id: '550e8400-e29b-41d4-a716-446655440000' }).select().single()
    if(!error && data){ setItems(prev => [data as PantryItem, ...prev]) }
  }

  async function removeItem(id: string){
    await supabaseAdmin.from('pantry_items').delete().eq('id', id)
    setItems(prev => prev.filter(i=>i.id!==id))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Pantry</h1>
      <IngredientInput onAdd={addItem} />
      <div className="mt-6 grid gap-2">
        {loading && <div>Loading</div>}
        {items.map(i => (
          <div key={i.id} className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>{i.name}</div>
            <button onClick={()=>removeItem(i.id)} className="text-sm text-red-600">Remove</button>
          </div>
        ))}
        {!loading && items.length===0 && <div className="text-gray-500">No items yet  add some above.</div>}
      </div>
    </div>
  )
}
