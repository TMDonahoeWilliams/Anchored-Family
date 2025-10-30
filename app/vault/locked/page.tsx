'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type DocRow = {
  id: string;
  household_id: string;
  folder: 'shared' | 'locked';
  name: string;
  path: string;
  size: number | null;
  uploaded_by: string | null;
  tags: string[] | null;
  created_at: string;
};

const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000'; // TODO: from session
const USER_ID = 'demo-user';           // TODO: from session

export default function VaultLockedPage() {
  const [isManager, setIsManager] = useState(false);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string>('');

  useEffect(() => {
    (async () => {
      // Replace with your real role check. Example:
      // select role from household_members where household_id=... and user_id=...
      const { data: roleRow } = await supabase
        .from('household_members')
        .select('role')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('user_id', USER_ID)
        .maybeSingle();

      setIsManager((roleRow?.role || '').toLowerCase() === 'manager');
    })();
  }, []);

  useEffect(() => {
    if (!isManager) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('vault_documents')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('folder', 'locked')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setDocs([]);
      } else {
        setDocs((data || []) as DocRow[]);
      }
      setLoading(false);
    })();
  }, [isManager]);

  const filtered = useMemo(() => {
    if (!q.trim()) return docs;
    const query = q.toLowerCase();
    return docs.filter(d =>
      d.name.toLowerCase().includes(query) ||
      (d.tags || []).some(t => t.toLowerCase().includes(query))
    );
  }, [q, docs]);

  async function upload() {
    if (!isManager) return alert('Only household managers can upload to Locked.');
    if (!file) return alert('Pick a file to upload.');
    const key = `${HOUSEHOLD_ID}/locked/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('vault').upload(key, file, { upsert: false });
    if (upErr) return alert(upErr.message);

    const { data, error } = await supabase
      .from('vault_documents')
      .insert({
        household_id: HOUSEHOLD_ID,
        folder: 'locked',
        name: file.name,
        path: key,
        size: file.size,
        uploaded_by: USER_ID,
        tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : null
      })
      .select()
      .single();

    if (error) return alert(error.message);
    setFile(null);
    setTags('');
    setDocs(prev => [data as DocRow, ...prev]);
    alert('Uploaded to Locked.');
  }

  async function download(d: DocRow) {
    const { data, error } = await supabase.storage.from('vault').createSignedUrl(d.path, 60);
    if (error || !data?.signedUrl) return alert(error?.message || 'Download failed');
    window.open(data.signedUrl, '_blank');
  }

  if (!isManager) {
    return (
      <div className="container">
        <h1 className="page-title">Family Vault — Locked</h1>
        <section className="card section">
          <div className="subtitle">You don’t have access to the Locked vault.</div>
          <div className="subcategories" style={{ marginTop: 8 }}>
            <Link href="/vault" className="btn btn--sm">↩ Back to Vault</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="page-title">Family Vault — Locked</h1>

      <section className="card section">
        <h2 className="section-title">Search & Upload</h2>
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <input
            className="btn btn--sm"
            placeholder="Search by name or tag…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <input
            type="file"
            className="btn btn--sm"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          <input
            className="btn btn--sm"
            placeholder="Tags (comma separated, optional)"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
          <button className="btn btn--sm accent-rose" onClick={upload}>⬆️ Upload to Locked</button>
        </div>
        <div className="subcategories">
          <Link href="/vault" className="btn btn--sm">↩ Family Vault</Link>
          <Link href="/vault/shared" className="btn btn--sm accent-cyan">📂 Shared</Link>
        </div>
      </section>

      <section className="card section">
        <h2 className="section-title">Documents</h2>
        {loading ? (
          <div className="subtitle">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="subtitle">No documents found.</div>
        ) : (
          <ul>
            {filtered.map(d => (
              <li key={d.id} className="card" style={{ margin: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{d.name}</strong>
                  <div className="subtitle">
                    {(d.size ?? 0).toLocaleString()} bytes • {new Date(d.created_at).toLocaleString()}
                    {d.tags?.length ? <> • Tags: {d.tags.join(', ')}</> : null}
                  </div>
                </div>
                <div className="subcategories">
                  <button className="btn btn--sm" onClick={() => download(d)}>⬇️ Download</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
