'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Later you can replace this with a real user session check
const USER_ROLE = 'manager'; // or 'member'

export default function VaultPage() {
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    // Example: Replace this with a call to your Supabase session or household role table
    setIsManager(USER_ROLE === 'manager');
  }, []);

  return (
    <section id="family-vault" className="container card section">
      <h2 className="section-title">Family Vault</h2>
      
      <div className="subcategories">
        {/* Shared Vault Section */}
        <Link className="btn btn--sm accent-cyan" href="/vault/shared">
          📂 Shared
        </Link>

        {/* Locked Vault Section - Only for Managers */}
        {isManager && (
          <Link className="btn btn--sm accent-rose" href="/vault/locked">
            🔐 Locked
          </Link>
        )}
      </div>
    </section>
  );
}
