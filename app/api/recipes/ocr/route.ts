import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

import Tesseract from 'tesseract.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server route, use Service Role
);

function parseRecipe(text: string) {
  // very naive parser: split on double newline
  const chunks = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const title = chunks[0]?.split('\n')[0]?.slice(0, 120) || 'Scanned Recipe';
  // try to find ingredients and instructions blocks
  const ingIdx = chunks.findIndex(c => /ingredients/i.test(c));
  const insIdx = chunks.findIndex(c => /instructions|method|directions/i.test(c));
  const ingredients = ingIdx >= 0 ? chunks[ingIdx].split(/\r?\n/).slice(1).map(s=>s.trim()).filter(Boolean) : [];
  const instructions = insIdx >= 0 ? chunks[insIdx].split(/\r?\n/).slice(1).join('\n') : '';
  const summary = chunks[1] && !/ingredients|instructions|method/i.test(chunks[1]) ? chunks[1].slice(0, 240) : '';
  return { title, summary, ingredients, instructions };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const household_id = String(form.get('household_id') || '');

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!household_id) return NextResponse.json({ error: 'household_id is required' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const { data } = await Tesseract.recognize(buf, 'eng');
    const raw = data.text || '';
    const parsed = parseRecipe(raw);

    const { data: row, error } = await supabase
      .from('recipes')
      .insert({
        household_id,
        title: parsed.title,
        summary: parsed.summary || null,
        ingredients: parsed.ingredients.length ? parsed.ingredients : null,
        instructions: parsed.instructions || null,
        source: 'ocr',
        cover_url: null
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recipe: row, raw });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'OCR failed' }, { status: 500 });
  }
}
