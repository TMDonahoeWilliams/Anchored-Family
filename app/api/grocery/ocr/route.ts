import { NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import { supabaseAdmin } from '@/lib/supabaseServer'; // ← named import from the file above

// Force Node runtime (Tesseract needs Node, not Edge)
export const runtime = 'nodejs';

function toNames(text: string) {
  return text
    .split(/\r?\n|,|;/)
    .map((s) => s.trim().replace(/[-•*]+/g, ' '))
    .filter(Boolean)
    .slice(0, 50);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const { data } = await Tesseract.recognize(buffer, 'eng');
  const names = toNames(data.text);
  if (names.length === 0) return NextResponse.json({ created: 0, inserted: [] });

  const rows = names.map((n) => ({
    name: n,
    quantity: null as number | null,
    unit: null as string | null,
    is_done: false,
    is_favorite: false,
    source: 'camera',
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from('grocery_items')
    .insert(rows)
    .select('*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ created: inserted?.length || 0, inserted });
}

