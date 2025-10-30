'use client'
import { useState } from 'react'

export default function IngredientInput({ onAdd }:{ onAdd:(name:string)=>void }){
  const [value, setValue] = useState('')
  return (
    <div className="flex gap-2">
      <input className="border rounded-md px-3 py-2 w-full" placeholder="Add an ingredient (e.g., chicken)"
        value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && value.trim()){ onAdd(value.trim()); setValue('') }}} />
      <button className="bg-black text-white px-4 rounded-md" onClick={()=>{ if(value.trim()){ onAdd(value.trim()); setValue('') }}}>Add</button>
    </div>
  )
}
