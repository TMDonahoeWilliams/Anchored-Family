'use client';
import React, { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.');
}

const supabaseClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sanitizeNext(next: string | null | undefined): string {
  if (!next) return '/home';
  try {
    const url = new URL(next, 'https://example.com');
    const path = url.pathname + (url.search || '') + (url.hash || '');
    if (!path || !path.startsWith('/')) return '/home';
    return path;
  } catch (e) {
    return '/home';
  }
}

export default function LoginPage() {
  const [nextParam, setNextParam] = useState('/home');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get('next') ?? params.get('redirect') ?? params.get('returnTo') ?? '/home';
      const safe = sanitizeNext(rawNext);
      setNextParam(safe);
      console.log('[login] next param:', { rawNext, safe });
    } catch (e) {
      setNextParam('/home');
    }
  }, []);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'email' | 'username' | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function resolveEmailIfNeeded(id: string) {
    if (mode === 'email' || id.includes('@')) return id;
    const res = await fetch('/api/auth/username-to-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: id }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Failed resolving username: ${res.status} ${body}`);
    }
    const json = await res.json();
    if (!json?.email) throw new Error('No email found for that username');
    return json.email as string;
  }

  async function setServerSession(accessToken: string, expiresIn?: number) {
    console.log('[login] calling set-server-session', { expiresIn });
    const res = await fetch('/api/auth/set-server-session', {
      method: 'POST',
      credentials: 'same-origin', // important: ensure cookies accepted for same-origin
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    });
    console.log('[login] set-server-session response', { ok: res.ok, status: res.status });
    let text = '';
    try {
      // read body for debugging
      text = await res.text();
      console.log('[login] set-server-session response body:', text);
    } catch (e) {
      console.warn('[login] could not read response body', e);
    }
    if (!res.ok) {
      // raise with body to make errors obvious in UI and console
      throw new Error(`set-server-session failed: ${res.status} ${text}`);
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    console.log('[login] submit start', { identifier, mode });

    try {
      const trimmed = identifier.trim();
      if (!trimmed || !password) {
        setError('Please enter an email/username and password.');
        setLoading(false);
        return;
      }

      let email: string;
      if (mode === 'email' || trimmed.includes('@')) {
        email = trimmed;
      } else if (mode === 'username') {
        email = await resolveEmailIfNeeded(trimmed);
      } else {
        email = trimmed.includes('@') ? trimmed : await resolveEmailIfNeeded(trimmed);
      }

      console.log('[login] attempting supabase signInWithPassword for', { email });
      const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[login] supabase sign-in result', { data, signInError });
      if (signInError) {
        setError(signInError.message ?? 'Sign in failed');
        setLoading(false);
        return;
      }

      const accessToken = data?.session?.access_token ?? null;
      const expiresAt = data?.session?.expires_at ?? null;
      console.log('[login] session tokens', { accessTokenPresent: !!accessToken, expiresAt });

      if (!accessToken) {
        setError('Sign in succeeded but no access token returned.');
        setLoading(false);
        return;
      }

      let expiresIn: number | undefined;
      if (expiresAt) {
        const nowSec = Math.floor(Date.now() / 1000);
        expiresIn = Math.max(60, Number(expiresAt) - nowSec);
      }

      try {
        await setServerSession(accessToken, expiresIn);
        console.log('[login] set-server-session succeeded, navigating');
        // Use full navigation so cookie is included on first request
        window.location.replace(nextParam);
      } catch (err: any) {
        // Show clear info and console output
        console.error('[login] set-server-session failed:', err);
        setError(`Failed to set server session: ${err?.message ?? String(err)}`);
        // still attempt client-side navigation as fallback so user can continue (useful for debugging)
        console.log('[login] fallback navigate to', nextParam);
        window.location.replace(nextParam);
      }
    } catch (err: any) {
      console.error('[login] error during login flow', err);
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '48px auto', padding: 20 }}>
      <h1>Sign in</h1>

      <p style={{ marginTop: 0, color: '#444' }}>
        Sign in with your email or username. Choose whether you want to use email or username,
        or leave "Auto" to detect automatically.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 12 }}>
          <input type="radio" name="mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />{' '}
          Auto
        </label>

        <label style={{ marginRight: 12 }}>
          <input type="radio" name="mode" checked={mode === 'email'} onChange={() => setMode('email')} />{' '}
          Email
        </label>

        <label>
          <input type="radio" name="mode" checked={mode === 'username'} onChange={() => setMode('username')} />{' '}
          Username
        </label>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Email or username</label>
          <input
            aria-label="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={mode === 'username' ? 'username' : 'you@example.com'}
            style={{ width: '100%', padding: '8px 10px', fontSize: 16 }}
            autoComplete="username"
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Password</label>
          <input
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Your password"
            style={{ width: '100%', padding: '8px 10px', fontSize: 16 }}
            autoComplete="current-password"
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        {info && <div style={{ color: 'green', marginBottom: 8 }}>{info}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading} style={{ padding: '8px 14px' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = '/forgot-password';
            }}
            style={{ padding: '8px 14px' }}
          >
            Forgot password
          </button>
        </div>
      </form>
    </div>
  );
}
