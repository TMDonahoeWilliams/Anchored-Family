'use client';
import React, { useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // In dev this helps surface a missing env var quickly (don't log secrets in prod)
  // eslint-disable-next-line no-console
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.');
}

const supabaseClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(''); // email or username
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'email' | 'username' | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function resolveEmailIfNeeded(id: string) {
    // If user selected "email" mode or id contains @ treat it as email
    if (mode === 'email' || id.includes('@')) return id;
    // If user selected "username" or auto-detected username, call server to map username -> email
    try {
      const res = await fetch('/api/auth/username-to-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `Failed to resolve username (${res.status})`);
      }
      const json = await res.json();
      if (!json?.email) throw new Error('No email found for that username');
      return json.email as string;
    } catch (err) {
      throw err;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const trimmed = identifier.trim();
      if (!trimmed || !password) {
        setError('Please enter your email/username and password.');
        return;
      }

      // determine whether to treat identifier as email or username
      let email: string;
      if (mode === 'email' || trimmed.includes('@')) {
        email = trimmed;
      } else if (mode === 'username') {
        email = await resolveEmailIfNeeded(trimmed);
      } else {
        // auto mode: if identifier looks like an email use it, otherwise try username->email
        if (trimmed.includes('@')) {
          email = trimmed;
        } else {
          // attempt to resolve; if fails, show error from resolver
          email = await resolveEmailIfNeeded(trimmed);
        }
      }

      // sign in using Supabase client (client-side)
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message ?? 'Sign in failed');
        return;
      }

      // Successful sign-in — redirect to intended page or dashboard
      setInfo('Signed in successfully. Redirecting…');
      // small delay to allow UI update
      setTimeout(() => {
        // If you use a next query param, handle it here (e.g. /login?next=...)
        router.push('/dashboard');
      }, 350);
    } catch (err: any) {
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
          <input
            type="radio"
            name="mode"
            checked={mode === 'auto'}
            onChange={() => setMode('auto')}
          />{' '}
          Auto
        </label>

        <label style={{ marginRight: 12 }}>
          <input
            type="radio"
            name="mode"
            checked={mode === 'email'}
            onChange={() => setMode('email')}
          />{' '}
          Email
        </label>

        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'username'}
            onChange={() => setMode('username')}
          />{' '}
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
              // fallback to password reset flow if desired
              router.push('/forgot-password');
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
