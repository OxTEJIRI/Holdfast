import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Header } from '@/components/Header'
import { Providers } from '@/components/Providers'
import { GITHUB_URL } from '@/lib/config'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face' })

export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Holdfast: launches that reward the people who stay',
  description:
    'A conviction layer for Meteora DBC launches: snipers locked out of the first minutes, holders paid a perpetual share of the fees by how much × how long they hold.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">{children}</main>
          <footer className="border-t border-line py-8 text-center text-xs text-faint">
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
