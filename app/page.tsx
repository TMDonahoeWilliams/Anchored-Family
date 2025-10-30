// app/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MarketingPage from './(marketing)/page';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    redirect('/home'); // logged in → home page
  } else {
    // Serve the marketing page directly instead of redirecting
    return <MarketingPage />;
  }
}
