'use client';

import React, { useEffect, useState } from 'react';

type Scripture = {
  text: string;
  reference: string;
  version?: string | null;
  date?: string | null;
  source?: string | null;
};

const VERSIONS = ['KJV', 'NKJV', 'NIV'] as const;

export default function TodaysScriptureClient({ initialScripture }: { initialScripture: Scripture | null }) {
  const [scripture, setScripture] = useState<Scripture | null>(initialScripture);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // initialize selected version from initialScripture.version or default to 'NIV'
  const initialVersion = (initialScripture?.version ?? 'NIV') as string;
  const [selectedVersion, setSelectedVersion] = useState<string>(initialVersion);

  // If initialScripture later changes (unlikely in current flow), update selectedVersion
  useEffect(() => {
    setSelectedVersion(initialScripture?.version ?? 'NIV');
    setScripture(initialScripture);
  }, [initialScripture]);

  async function refresh(version?: string) {
    try {
      setLoading(true);
      setError(null);
      const ver = (version ?? selectedVersion) ?? '';
      const url = '/api/devotion/todays-scripture' + (ver ? `?version=${encodeURIComponent(ver)}` : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        setError('Failed to refresh: ' + txt);
        return;
      }
      const data = (await res.json()) as Scripture;
      setScripture(data);
      // if API returned a version, set it in the selector
      if (data?.version) setSelectedVersion(data.version);
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
      <label className="flex items-center gap-2">
        <span className="text-sm">Version</span>
        <select
          aria-label="Scripture version"
          value={selectedVersion}
          onChange={(e) => setSelectedVersion(e.target.value)}
          className="px-2 py-1 border rounded"
        >
          {VERSIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <button className="af-btn af-btn-outline" onClick={() => refresh(selectedVersion)} disabled={loading} aria-disabled={loading}>
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
