'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { Bar } from '@/components/ui'
import { explorer } from '@/lib/config'
import { pct, short, sol } from '@/lib/format'
import { useLaunchData } from '@/lib/useLaunch'
import { useNow } from '@/lib/useNow'
import { ConvictionCard } from './ConvictionCard'
import { Leaderboard } from './Leaderboard'
import { RewardsPanel } from './RewardsPanel'
import { RulesTimeline } from './RulesTimeline'
import { TradePanel } from './TradePanel'
import { PHASE_LABEL, phaseOf } from './phase'

export function TokenView({ mint: mintStr }: { mint: string }) {
  const mint = useMemo(() => {
    try {
      return new PublicKey(mintStr)
    } catch {
      return null
    }
  }, [mintStr])
  const { publicKey } = useWallet()
  const { data, error, refresh, board, refreshBoard } = useLaunchData(mint)
  const now = useNow()

  if (!mint) return <p className="text-muted">That isn’t a valid token address.</p>
  if (data === undefined && !error) return <Skeleton />
  if (!data) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold">Not a Holdfast launch</h1>
        <p className="mt-2 text-muted">No Holdfast launch exists for {short(mintStr, 6)} on this network.</p>
      </div>
    )
  }
  const phase = phaseOf(data, now)
  const onDone = () => {
    refresh()
    refreshBoard()
  }
  return (
    <div className="relative space-y-6 stagger">
      <div className="flex flex-wrap items-center gap-4">
        {data.meta.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.meta.image} alt="" className="h-14 w-14 rounded-2xl border border-line bg-panel-2 object-cover" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-soft text-lg font-bold text-teal">{data.meta.symbol.slice(0, 2)}</div>
        )}
        <div className="min-w-0">
          <h1 className="display text-3xl font-bold tracking-tight">
            {data.meta.name} <span className="text-muted">${data.meta.symbol}</span>
          </h1>
          <a href={explorer('address', mintStr)} target="_blank" rel="noreferrer" className="font-mono text-xs text-faint hover:text-muted">
            {short(mintStr, 6)}
          </a>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
            phase === 'window' || phase === 'locks' ? 'border-amber/40 bg-amber-soft text-amber' : 'border-teal/40 bg-teal-soft text-teal'
          }`}
        >
          <span className={`ping relative h-2 w-2 rounded-full bg-current ${phase === 'graduated' || phase === 'migrated' ? '' : ''}`} />
          {PHASE_LABEL[phase]}
        </span>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="display text-sm font-semibold uppercase tracking-[0.14em] text-muted">Bonding curve</span>
          <span className="num text-sm">
            <span className="text-lg font-semibold">{sol(data.quoteReserve, 3)}</span> / {sol(data.threshold, 2)} SOL · {pct(data.progress, 1)}
          </span>
        </div>
        <Bar value={data.progress} className="mt-3 h-3" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <ConvictionCard d={data} now={now} connected={!!publicKey} />
          <Leaderboard rows={board} final={data.launch.finalized} />
          <RulesTimeline d={data} now={now} />
        </div>
        <div className="space-y-6">
          <TradePanel d={data} now={now} phase={phase} onDone={onDone} />
          <RewardsPanel d={data} now={now} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="h-14 w-64 animate-pulse rounded-xl bg-panel" />
      <div className="h-20 animate-pulse rounded-2xl bg-panel" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="h-80 animate-pulse rounded-2xl bg-panel" />
        <div className="h-80 animate-pulse rounded-2xl bg-panel" />
      </div>
    </div>
  )
}
