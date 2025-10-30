// app/layout.tsx
import '../styles/globals.css';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
// Update the import path to match your actual file structure, for example:
// Update the import path to match your actual file structure, for example:
// import { getServerAuth } from '../lib/supabase/server'; // adjust path as needed
// import { getServerAuth } from '@/lib/supabaseServer'; // Try using an absolute import if you have a tsconfig.json/next.config.js path alias set up
import { getServerAuth } from '@/lib/supabaseServer';

export const metadata = {
  title: 'Anchored Family',
  description: 'Your all-in-one family control center',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getServerAuth(); // { user, error } or { user: null, error }
  const isAuthed = Boolean(auth?.user);

  return (
    <html lang="en">
      <body className="has-topbar">
        {/* Fixed top bar */}
        <header className="topbar">
          <div className="topbar__inner">
            <Link href="/home" className="topbar__brand">
              <img className="topbar__logo" src="/images/logo.PNG" alt="Anchored Family Logo" />
              <span className="topbar__name">Anchored Family</span>
            </Link>

            {/* Right side: User menu with logout */}
            <UserMenu />
          </div>
        </header>

        {/* Page content (offset by fixed header via .has-topbar) */}
        <main>{children}</main>
      </body>
    </html>
  );
}
