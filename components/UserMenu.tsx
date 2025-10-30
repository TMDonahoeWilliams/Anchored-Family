'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function UserMenu() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (event === 'SIGNED_OUT') {
          router.push('/login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="auth-actions">
        <div className="animate-pulse h-8 w-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Get user's display name (email or name if available)
  const displayName = user.user_metadata?.full_name || 
                     user.user_metadata?.name || 
                     user.email?.split('@')[0] || 
                     'User';

  return (
    <div className="auth-actions">
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-700">Hi, {displayName}</span>
        <button
          onClick={handleLogout}
          disabled={isLoading}
          className="text-sm text-red-600 hover:text-red-800 focus:outline-none focus:underline disabled:opacity-50"
        >
          {isLoading ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}