import { NextResponse } from 'next/server';

const API_KEY = process.env.SPOONACULAR_API_KEY || '';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id'); // details mode
  const q = url.searchParams.get('q') || '';
  const diet = url.searchParams.get('diet') || '';
  const maxReadyMinutes = url.searchParams.get('maxReadyMinutes') || '';

  if (!API_KEY) {
    return NextResponse.json({ 
      error: 'Missing SPOONACULAR_API_KEY',
      message: 'Please add your Spoonacular API key to .env.local as SPOONACULAR_API_KEY=your_key_here'
    }, { status: 500 });
  }

  try {
    if (id) {
      // Details endpoint
      const r = await fetch(`https://api.spoonacular.com/recipes/${id}/information?apiKey=${API_KEY}&includeNutrition=false`, { cache: 'no-store' });
      const recipe = await r.json();
      if (!r.ok) {
        console.error('Spoonacular API error:', recipe);
        return NextResponse.json({ 
          error: recipe.message || 'Failed to fetch recipe details',
          status: r.status 
        }, { status: r.status });
      }
      return NextResponse.json({ recipe });
    }

    // Validate search query
    if (!q.trim()) {
      return NextResponse.json({ 
        error: 'Search query is required',
        message: 'Please provide a search term'
      }, { status: 400 });
    }

    // Search endpoint
    const params = new URLSearchParams({
      apiKey: API_KEY,
      query: q.trim(),
      number: '24',
      addRecipeInformation: 'true',
      instructionsRequired: 'true'
    });
    if (diet) params.set('diet', diet);
    if (maxReadyMinutes && !isNaN(Number(maxReadyMinutes))) {
      params.set('maxReadyMinutes', maxReadyMinutes);
    }

    console.log('Searching Spoonacular API with params:', params.toString());
    
    const r = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params.toString()}`, { cache: 'no-store' });
    const j = await r.json();
    
    if (!r.ok) {
      console.error('Spoonacular search error:', j);
      return NextResponse.json({ 
        error: j.message || 'Search failed',
        status: r.status,
        details: j
      }, { status: r.status });
    }
    
    console.log(`Found ${j.results?.length || 0} recipes for query: "${q}"`);
    return NextResponse.json({ results: j.results || [], totalResults: j.totalResults || 0 });
  } catch (e: any) {
    console.error('Recipe API error:', e);
    return NextResponse.json({ 
      error: e.message || 'API request failed',
      message: 'There was an error connecting to the Spoonacular API. Please try again.'
    }, { status: 500 });
  }
}
