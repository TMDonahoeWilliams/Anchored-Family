import React from 'react';
import type { Scripture } from './types';
import TodaysScriptureClient from './TodaysScriptureClient';

async function fetchInitialScripture(version?: string): Promise<Scripture | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const url = new URL('/api/devotion/todays-scripture', base);
    if (version) url.searchParams.set('version', version);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.text) return null;
    // Normalize reference to string or null
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
