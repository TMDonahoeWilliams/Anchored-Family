'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AccountPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Auth error:', error);
          router.push('/login?next=/account');
          return;
        }
        
        if (!session) {
          router.push('/login?next=/account');
          return;
        }
        
        setSession(session);
      } catch (error) {
        console.error('Session error:', error);
        router.push('/login?next=/account');
      } finally {
        setLoading(false);
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.push('/login?next=/account');
        } else {
          setSession(session);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="container">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="container">
      <h1 className="page-title">Account</h1>

      {/* Quick nav cards */}
      <nav className="categories" aria-label="Account sections">
        {/* Profile */}
        <div className="category-card">
          <div style={{ width: '100%' }}>
            <div className="section-title" style={{ marginBottom: '.5rem' }}>User Profile</div>
            <div className="subtitle" style={{ marginBottom: '.5rem' }}>
              <strong>{session.user.email}</strong>
            </div>
            <Link href="/account/manager" className="btn accent-violet">Edit Profile</Link>
          </div>
        </div>

        {/* Subscription */}
        <div className="category-card">
          <div style={{ width: '100%' }}>
            <div className="section-title" style={{ marginBottom: '.5rem' }}>Subscription</div>
            <div className="subtitle" style={{ marginBottom: '.5rem' }}>
              Manage your subscription and billing
            </div>
            <Link href="/account/settings/subscription" className="btn accent-blue">Manage Subscription</Link>
          </div>
        </div>

        {/* Settings */}
        <div className="category-card">
          <div style={{ width: '100%' }}>
            <div className="section-title" style={{ marginBottom: '.5rem' }}>Account Settings</div>
            <div className="subtitle" style={{ marginBottom: '.5rem' }}>
              Privacy, notifications, and preferences
            </div>
            <Link href="/account/settings" className="btn accent-green">Account Settings</Link>
          </div>
        </div>
      </nav>

      {/* Overview */}
      <section className="card section">
        <h2 className="section-title">Overview</h2>
        <div className="subcategories">
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>User Email</span>
            <span className="subtitle">{session.user.email}</span>
          </div>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Account Created</span>
            <span className="subtitle">{new Date(session.user.created_at).toLocaleDateString()}</span>
          </div>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>User ID</span>
            <span className="subtitle">{session.user.id.slice(0, 8)}...</span>
          </div>
          <div className="btn btn--sm" style={{ justifyContent: 'space-between' }}>
            <span>Last Sign In</span>
            <span className="subtitle">{session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}