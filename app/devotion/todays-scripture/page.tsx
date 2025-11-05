import React from 'react';

type Scripture = {
  text: string;
  reference: string;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

async function fetchTodaysScripture(): Promise<Scripture | null> {
  try {
    // Resolve a sensible origin for server-side fetch:
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000';

    const res = await fetch(new URL('/api/devotion/todays-scripture', origin).toString(), {
      // Always fetch the latest value on the server page render
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error('Failed to fetch todays scripture', await res.text());
      return null;
    }
    const data = await res.json();
    // Expect API to return { text, reference, version?, date?, source? }
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

            <div className="mt-6 flex gap-3">
              {/* Client component below will handle refresh and copy/share actions */}
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

/* Client-side component: refresh, copy, share */
'use client';
import { useState } from 'react';

function TodaysScriptureClient({ initialScripture }: { initialScripture: Scripture | null }) {
  const [scripture, setScripture] = useState<Scripture | null>(initialScripture);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/devotion/todays-scripture', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        setError('Failed to refresh: ' + txt);
        return;
      }
      const data = (await res.json()) as Scripture;
      setScripture(data);
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function copyText() {
    if (!scripture) return;
    try {
      await navigator.clipboard.writeText(`${scripture.text}\n— ${scripture.reference}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!scripture || !(navigator as any).share) {
      return;
    }
    try {
      await (navigator as any).share({
        title: `Today's Scripture — ${scripture.reference}`,
        text: `${scripture.text}\n— ${scripture.reference}`,
        url: window.location.href,
      });
    } catch {
      // user cancelled or not supported
    }
  }

  return (
    <>
      <button
        className="af-btn af-btn-outline"
        onClick={refresh}
        disabled={loading}
        aria-disabled={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>

      <button className="af-btn af-btn-outline" onClick={copyText} disabled={!scripture}>
        {copied ? 'Copied' : 'Copy'}
      </button>

      <button className="af-btn af-btn-primary" onClick={share} disabled={!scripture || !(navigator as any).share}>
        Share
      </button>

      {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
    </>
  );
}
