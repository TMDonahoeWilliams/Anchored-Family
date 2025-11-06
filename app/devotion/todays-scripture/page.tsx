import React from 'react';
import TodaysScriptureClient from './TodaysScriptureClient';

type Scripture = {
  text: string;
  reference?: string | null;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

/**
 * Server component for Today's Scripture page.
 * - Fetches the API server-side (so the first render contains scripture if available).
 * - Passes the result to the client component as `initialScripture`.
 *
 * Notes:
 * - Uses an internal API route so authorization/logic is centralized.
 * - Adds ?debug=0 to avoid verbose debug, but you can add &debug=1 when testing.
 */

async function fetchInitialScripture(version?: string) {
  try {
    const url = new URL('/api/devotion/todays-scripture', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000');
    if (version) url.searchParams.set('version', version);
    // Server-side fetch; revalidate as desired (no-store if you want fresh)
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      // return null and let client handle refresh
      return null;
    }
    const body = await res.json();
    // Ensure object shape
    if (!body || !body.text) return null;
    return body as Scripture;
  } catch (err) {
    // swallow — client can still refresh
    console.error('[page] failed to fetch initial scripture', err);
    return null;
  }
}

export default async function TodaysScripturePage() {
  // Optionally pick a default version; you could read user preference here.
  const defaultVersion = 'NIV';
  const initialScripture = await fetchInitialScripture(defaultVersion);

  return (
    <div className="prose">
      <h1>Today's Scripture</h1>
      <p className="text-muted">A short reflection to begin your day</p>

      <section className="mt-4">
        <TodaysScriptureClient initialScripture={initialScripture} />
      </section>
    </div>
  );
}
