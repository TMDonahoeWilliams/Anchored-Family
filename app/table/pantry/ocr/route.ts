import { NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
// Update the import path if the file is in a different location, e.g.:
import { createClient } from '@supabase/supabase-js';

// Make sure to set these environment variables in your environment
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Very simple text-to-item parser: each non-empty line becomes an item name.
// You can make this smarter (remove prices, sizes, etc.) later.
function toItemNames(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // Heuristics: strip quantities like "x2", sizes like "16oz", and dashes
  return lines.map(l =>
    l
      .replace(/\b(x\s*\d+|\d+\s?(oz|lb|lbs|g|kg|ml|l))\b/gi, '')
      .replace(/[-•*]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  ).filter(Boolean);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const household_id = String(form.get('household_id') || '550e8400-e29b-41d4-a716-446655440000');

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let data;
  try {
    const result = await Tesseract.recognize(buffer, 'eng');
    data = result.data;
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  const names = toItemNames(data.text);
  if (names.length === 0) {
    return NextResponse.json({ created: 0, inserted: [] });
  }

  // Insert unique names (ignore duplicates already in pantry)
  const rows = names.slice(0, 50).map(n => ({
    name: n,
    quantity: null as number | null,
    unit: null as string | null,
    household_id
  }));

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('pantry_items')
    .insert(rows)
    .select('*');

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ created: inserted?.length || 0, inserted });
}
