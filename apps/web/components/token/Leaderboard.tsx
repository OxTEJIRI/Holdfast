'use client'
import type { LeaderboardRow } from '@holdfast/sdk'
import { useWallet } from '@solana/wallet-adapter-react'
import { Section } from '@/components/ui'
import { compact, pct, short, tokens } from '@/lib/format'

export function Leaderboard({ rows, final }: { rows: LeaderboardRow[]; final: boolean }) {
  const { publicKey } = useWallet()
  const me = publicKey?.toBase58()
  return (
    <Section title="Leaderboard" aside={<span className="text-xs text-muted">{final ? 'final shares' : 'projected share of rewards'}</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No holders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faint">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2 pr-2">Holder</th>
                <th className="pb-2 pr-2 text-right">Tokens</th>
                <th className="pb-2 pr-2 text-right">Points</th>
                <th className="pb-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mine = r.owner.toBase58() === me
                return (
                  <tr key={r.holder.toBase58()} className={`border-t border-line ${mine ? 'text-teal' : ''}`}>
                    <td className="py-2 pr-2 text-faint">{r.rank}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{mine ? 'you' : short(r.owner.toBase58())}</td>
                    <td className="py-2 pr-2 text-right">{tokens(r.trackedBalance)}</td>
                    <td className="py-2 pr-2 text-right">{compact(r.points)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:block">
                          <div className="h-full bg-teal" style={{ width: `${Math.min(100, r.share * 100)}%` }} />
                        </div>
                        {pct(r.share, 1)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
