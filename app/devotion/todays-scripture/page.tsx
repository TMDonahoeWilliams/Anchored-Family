import React from 'react';
import TodaysScriptureClient from './TodaysScriptureClient';

type Scripture = {
  text: string;
  reference: string;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

async function fetchTodaysScripture(): Promise<Scripture | null> {
  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000';

    const res = await fetch(new URL('/api/devotion/todays-scripture', origin).toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error('Failed to fetch todays scripture', await res.text());
      return null;
    }
    const data = await res.json();
    return data as Scripture;
  } catch (err) {
    console.error('Error fetching todays scripture', err);
    return null;
  }
}

export default async function Page() {
  const scripture = await fetchTodaysScripture();

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Today's Scripture</h1>
        <p className="text-sm text-muted-foreground">A short reflection to begin your day</p>
      </header>

      <section className="bg-white shadow rounded-lg p-6">
        {scripture ? (
          <>
            <article className="prose max-w-none">
              <p className="text-lg leading-relaxed">{scripture.text}</p>
              <p className="mt-4 font-medium">
                — {scripture.reference}
                {scripture.version ? <span className="text-sm font-normal"> ({scripture.version})</span> : null}
              </p>
              {scripture.date ? <p className="text-xs text-muted-foreground mt-2">Date: {scripture.date}</p> : null}
              {scripture.source ? <p className="text-xs text-muted-foreground mt-1">Source: {scripture.source}</p> : null}
            </article>

            <div className="mt-6">
              <TodaysScriptureClient initialScripture={scripture} />
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">We couldn't load today's scripture right now. Try refreshing the page.</p>
            <div className="mt-4">
              <TodaysScriptureClient initialScripture={null} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
