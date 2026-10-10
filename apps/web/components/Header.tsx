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

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-line)" strokeWidth="4" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-teal)" strokeWidth="4" strokeLinecap="round" strokeDasharray="60 82" transform="rotate(-90 16 16)" />
      <circle cx="16" cy="16" r="4" fill="var(--color-teal)" />
    </svg>
  )
}

export function Header() {
  const path = usePathname()
  const { publicKey } = useWallet()
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>Holdfast</span>
        </Link>
        <nav className="ml-2 hidden gap-1 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${path?.startsWith(n.href) ? 'bg-panel-2 text-fg' : 'text-muted hover:text-fg'}`}
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
