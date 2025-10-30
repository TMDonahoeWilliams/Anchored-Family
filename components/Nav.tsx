'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const tabs = [
  { href: '/', label: 'Pantry' },
  { href: '/results', label: 'Recipes' },
  { href: '/list', label: 'Grocery List' },
  { href: '/account', label: 'Account' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="border-b">
      <div className="container flex gap-4 py-3">
        <div className="font-semibold">Anchored Family</div>
        <div className="flex gap-3 text-sm">
          {tabs.map(t => (
            <Link key={t.href} href={t.href}
              className={clsx('px-2 py-1 rounded-md hover:bg-gray-100', pathname === t.href && 'bg-gray-200')}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
