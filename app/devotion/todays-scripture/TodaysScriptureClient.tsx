'use client';

import React, { useState } from 'react';

type Scripture = {
  text: string;
  reference: string;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

export default function TodaysScriptureClient({ initialScripture }: { initialScripture: Scripture | null }) {
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
    if (!scripture || !(navigator as any).share) return;
    try {
      await (navigator as any).share({
        title: `Today's Scripture — ${scripture.reference}`,
        text: `${scripture.text}\n— ${scripture.reference}`,
        url: window.location.href,
      });
    } catch {
      // user cancelled or unsupported
    }
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <button className="af-btn af-btn-outline" onClick={refresh} disabled={loading} aria-disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>

      <button className="af-btn af-btn-outline" onClick={copyText} disabled={!scripture}>
        {copied ? 'Copied' : 'Copy'}
      </button>

      <button className="af-btn af-btn-primary" onClick={share} disabled={!scripture || !(navigator as any).share}>
        Share
      </button>

      {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
    </div>
  );
}
