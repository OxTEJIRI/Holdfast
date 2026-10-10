import type { Metadata } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { Ambient } from '@/components/Ambient'
import { Spotlight } from '@/components/Spotlight'
import { Header } from '@/components/Header'
import { Providers } from '@/components/Providers'
import { GITHUB_URL } from '@/lib/config'
import './globals.css'

const head = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-head', weight: ['500', '600', '700', '800'] })
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face' })

export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Holdfast: launches that reward the people who stay',
  description:
    'A conviction layer for Meteora DBC launches: snipers locked out of the first minutes, holders paid a perpetual share of the fees by how much × how long they hold.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Ambient />
          <Spotlight />
          <Header />
          <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-8">{children}</main>
          <footer className="relative border-t border-line/60 py-8 text-center text-xs text-faint">
            Holdfast · built on Meteora DBC, DAMM v2 and Dynamic Fee Sharing · devnet demo, not audited ·{' '}
            <a className="underline hover:text-muted" href={GITHUB_URL}>
              GitHub
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
