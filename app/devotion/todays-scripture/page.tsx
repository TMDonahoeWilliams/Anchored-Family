import React from 'react';
import type { Scripture } from './types';
import TodaysScriptureClient from './TodaysScriptureClient';

const ISR_SECONDS = 60; // change as desired

async function fetchInitialScripture(version?: string): Promise<Scripture | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const url = new URL('/api/devotion/todays-scripture', base);
    if (version) url.searchParams.set('version', version);

    // Use ISR instead of no-store so Next can prerender the page safely.
    // `next: { revalidate: ISR_SECONDS }` tells Next to cache the fetch and revalidate after the given seconds.
    const res = await fetch(url.toString(), { next: { revalidate: ISR_SECONDS } });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.text) return null;
    return {
      text: String(json.text),
      reference: json.reference ?? null,
      version: json.version ?? null,
      date: json.date ?? null,
      source: json.source ?? null,
    };
  } catch (err) {
    console.error('[page] failed to fetch initial scripture', err);
    return null;
  }
}

export default async function TodaysScripturePage() {
  // Default to KJV as requested
  const defaultVersion = 'KJV';
  const initialScripture = await fetchInitialScripture(defaultVersion);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-semibold mb-1">Today's Scripture</h1>
        <p className="text-gray-600 mb-6">A short reflection to begin your day</p>

        {/* White card around the scripture area */}
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* Client component will render the version selector, buttons and scripture content */}
          <TodaysScriptureClient initialScripture={initialScripture} />
        </div>
      </div>
    </div>
  );
}
