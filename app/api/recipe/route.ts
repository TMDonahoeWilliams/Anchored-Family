import { NextResponse } from 'next/server'

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const key = process.env.SPOONACULAR_API_KEY
  if(!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if(!key) return NextResponse.json({ error: 'Missing SPOONACULAR_API_KEY' }, { status: 500 })

  const url = `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=false&apiKey=${key}`
  const r = await fetch(url, { next: { revalidate: 0 } })
  const json = await r.json()
  return NextResponse.json({ recipe: json })
}
