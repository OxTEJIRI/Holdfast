'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useWallet } from '@solana/wallet-adapter-react'
import { ENABLE_BURNER, NETWORK } from '@/lib/config'

// wallet button renders differently on server and client: client-only
const WalletMultiButton = dynamic(() => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton), { ssr: false })

const NAV = [
  { href: '/arena', label: 'Arena' },
  { href: '/launch', label: 'Launch' },
  { href: '/developers', label: 'Developers' },
]

/** A kelp frond anchored by its holdfast (root) inside a ring. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ee7c4" />
          <stop offset="1" stopColor="#9bd96b" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#logo-g)" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M16 25 C13 20 19 17 16 12 C14.5 9.5 16.5 7.5 18 6" fill="none" stroke="url(#logo-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 12 C19 11 21 12 22 14 C19 15 17 14 16 12Z" fill="url(#logo-g)" />
      <path d="M16 17 C13 16 11 17 10 19 C13 20 15 19 16 17Z" fill="url(#logo-g)" opacity="0.8" />
      <path d="M11.5 27 C13.5 25.5 14.8 25 16 25 C17.2 25 18.5 25.5 20.5 27 M13 28 C14.5 26.8 15.3 26 16 25 M19 28 C17.5 26.8 16.7 26 16 25" fill="none" stroke="url(#logo-g)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function Header() {
  const path = usePathname()
  const { publicKey } = useWallet()
  return (
    <header className="sticky top-0 z-40 border-b border-teal/10 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span className="display text-lg font-bold tracking-tight">Holdfast</span>
        </Link>
        <nav className="ml-2 hidden gap-1 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${path?.startsWith(n.href) ? 'bg-teal/10 text-teal' : 'text-muted hover:text-fg'}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto hidden rounded-full border border-line px-2.5 py-1 text-xs uppercase tracking-wider text-muted md:inline">
          {NETWORK}
        </span>
        <WalletMultiButton />
        {/* test builds only (burner wallet enabled): lets the browser E2E script read the address */}
        {ENABLE_BURNER && publicKey && <span data-testid="wallet-address" className="hidden">{publicKey.toBase58()}</span>}
      </div>
      <nav className="flex gap-1 border-t border-line px-4 py-1 sm:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1.5 text-sm ${path?.startsWith(n.href) ? 'text-fg' : 'text-muted'}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
