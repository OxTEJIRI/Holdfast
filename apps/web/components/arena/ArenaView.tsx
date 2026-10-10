'use client'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getLeaderboard } from '@holdfast/sdk'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bar as RBar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Section } from '@/components/ui'
import type { ArenaEvent, ArenaMeta, ArenaSummary, BotNames, Persona } from '@/lib/arena'
import { NETWORK, explorer } from '@/lib/config'
import { clock, pct } from '@/lib/format'
import { usePoll } from '@/lib/usePoll'

const PERSONAS: { key: Persona; title: string; who: string; color: string }[] = [
  { key: 'holder', title: 'Holders', who: '10 bots · small clips, never sell', color: 'var(--color-teal)' },
  { key: 'whale', title: 'Whale', who: '1 bot · wants 8% in the window', color: '#7dd3c8' },
  { key: 'sniper', title: 'Snipers', who: '3 bots · buy at t+2 s, dump ASAP', color: 'var(--color-amber)' },
  { key: 'bundler', title: 'Bundler', who: '1 bot · sprays 5 fresh wallets', color: '#e9a23b' },
  { key: 'flipper', title: 'Flippers', who: '6 bots · in and out in 30–90 s', color: 'var(--color-red)' },
  { key: 'closer', title: 'Closer', who: '1 bot · completes the curve', color: 'var(--color-muted)' },
]
const personaOf = (e: ArenaEvent): Persona | undefined => (e.persona === 'bundle' ? 'bundler' : e.persona)
const SPEEDS = [4, 8, 20, 60]

type Tally = { buys: number; sells: number; blocked: Record<string, number>; claimed: number }

export function ArenaView({ summary, meta, bots }: { summary: ArenaSummary; meta: ArenaMeta; bots: BotNames }) {
  const [speed, setSpeed] = useState(8)
  const [run, setRun] = useState(0)
  const [events, setEvents] = useState<ArenaEvent[]>([])
  const [done, setDone] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const start = useCallback(() => {
    esRef.current?.close()
    setEvents([])
    setDone(false)
    const es = new EventSource(`/api/arena/stream?speed=${speed}`)
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as ArenaEvent
      if (e.kind) setEvents((xs) => [...xs, e])
    }
    es.addEventListener('done', () => {
      setDone(true)
      setShowResults(true)
      es.close()
    })
    es.onerror = () => es.close()
    esRef.current = es
  }, [speed])

  useEffect(() => {
    start()
    return () => esRef.current?.close()
  }, [start, run])

  const t = events.length ? events[events.length - 1].t : 0
  const graduatedAt = events.find((e) => e.kind === 'graduate')?.t
  const W = meta.windowSecs
  const P = meta.windowSecs + meta.snipeLockSecs
  const end = Math.max(summary.durationSecs, P + 60)

  const tally = useMemo(() => {
    const m = new Map<Persona, Tally>(PERSONAS.map((p) => [p.key, { buys: 0, sells: 0, blocked: {}, claimed: 0 }]))
    for (const e of events) {
      const p = personaOf(e)
      if (!p) continue
      const x = m.get(p)!
      if (e.kind === 'buy') x.buys++
      if (e.kind === 'sell') x.sells++
      if (e.kind === 'blocked' && e.reason) x.blocked[e.reason] = (x.blocked[e.reason] ?? 0) + 1
      if (e.kind === 'claim') x.claimed += e.sol ?? 0
    }
    return m
  }, [events])
  const blockedSoFar = events.filter((e) => e.kind === 'blocked').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">The Arena</h1>
          <p className="mt-1 max-w-2xl text-muted">
            27 bots, one real launch on {summary.network}. Snipers, a bundler, a whale and flippers against ten patient holders. Replayed from the
            recorded run; every trade is on-chain.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`num h-8 rounded-lg border px-2.5 text-xs ${speed === s ? 'border-teal text-fg' : 'border-line text-muted'}`}
            >
              {s}×
            </button>
          ))}
          <button onClick={() => setRun((r) => r + 1)} className="h-8 rounded-lg border border-line px-3 text-xs text-muted hover:text-fg">
            Restart
          </button>
        </div>
      </div>

      {/* timeline */}
      <div className="card p-5">
        <div className="mb-2 flex justify-between text-xs text-muted">
          <span className="num">t = {clock(t)}</span>
          <span>{done ? 'run complete' : `${events.length} events · ${blockedSoFar} blocked`}</span>
        </div>
        <div className="relative h-8 overflow-hidden rounded-lg bg-ink">
          <div className="absolute inset-y-0 left-0 bg-amber/25" style={{ width: `${(W / end) * 100}%` }} />
          <div className="absolute inset-y-0 bg-amber/10" style={{ left: `${(W / end) * 100}%`, width: `${((P - W) / end) * 100}%` }} />
          {graduatedAt !== undefined && <div className="absolute inset-y-0 w-0.5 bg-teal" style={{ left: `${(graduatedAt / end) * 100}%` }} />}
          <div className="absolute inset-y-0 w-0.5 bg-fg transition-[left] duration-300" style={{ left: `${Math.min(100, (t / end) * 100)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber/60" />
            opening window {clock(W)}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber/25" />
            snipe-locks until {clock(P)}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-teal" />
            graduation {graduatedAt !== undefined ? `at ${clock(graduatedAt)}` : ''}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-2 gap-3 self-start">
          {PERSONAS.map((p) => {
            const x = tally.get(p.key)!
            const blocked = Object.entries(x.blocked)
            return (
              <div key={p.key} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="font-semibold">{p.title}</span>
                </div>
                <div className="mt-0.5 text-xs text-faint">{p.who}</div>
                <div className="num mt-3 grid grid-cols-2 gap-1 text-xs text-muted">
                  <span>buys {x.buys}</span>
                  <span>sells {x.sells}</span>
                </div>
                {blocked.map(([reason, n]) => (
                  <div key={reason} className="num mt-1 text-xs text-amber">
                    ✋ {reason} ×{n}
                  </div>
                ))}
                {x.claimed > 0 && <div className="num mt-1 text-xs text-teal">claimed {x.claimed.toFixed(5)} SOL</div>}
              </div>
            )
          })}
        </div>

        <Section title="Live feed" aside={<span className="text-xs text-muted">newest first</span>}>
          <ol className="max-h-[34rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
            {[...events].reverse().slice(0, 120).map((e, i) => (
              <li
                key={`${e.ts}-${i}`}
                className={`rise flex gap-3 rounded-lg px-2 py-1.5 ${
                  e.kind === 'blocked' ? 'bg-amber-soft/60' : e.kind === 'claim' ? 'bg-teal-soft/40' : e.kind === 'phase' || e.kind === 'graduate' ? 'bg-panel-2' : ''
                }`}
              >
                <span className="num w-12 shrink-0 text-right text-xs text-faint">{clock(e.t)}</span>
                <span className="w-4 shrink-0">{e.kind === 'blocked' ? '✋' : e.kind === 'claim' ? '◎' : e.kind === 'error' ? '!' : '·'}</span>
                <span className={`min-w-0 flex-1 ${e.kind === 'blocked' ? 'text-amber' : e.kind === 'phase' || e.kind === 'graduate' ? 'font-medium' : 'text-muted'}`}>
                  {e.bot && <span className="mr-1.5 font-mono text-xs text-fg">{e.bot}</span>}
                  {e.message}
                  {e.sig && (
                    <a className="ml-1.5 text-xs text-faint underline" href={explorer('tx', e.sig)} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  )}
                </span>
              </li>
            ))}
            {events.length === 0 && <li className="text-muted">Connecting to the replay…</li>}
          </ol>
        </Section>
      </div>

      <WhoGotPaid summary={summary} show={showResults} onShow={() => setShowResults(true)} />
      <FinalLeaderboard mint={meta.mint} bots={bots} network={meta.network} />

      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-sm">
        <span className="text-muted">On-chain proof:</span>
        <a className="text-teal underline" href={summary.explorer} target="_blank" rel="noreferrer">
          token on Explorer
        </a>
        {Object.entries(summary.keyTxs).map(([k, v]) => (
          <a key={k} className="text-muted underline hover:text-fg" href={v} target="_blank" rel="noreferrer">
            {k}
          </a>
        ))}
        {meta.network === NETWORK && (
          <Link className="ml-auto text-teal underline" href={`/t/${meta.mint}`}>
            Open the token page
          </Link>
        )}
      </div>
    </div>
  )
}

function WhoGotPaid({ summary, show, onShow }: { summary: ArenaSummary; show: boolean; onShow: () => void }) {
  const rows = PERSONAS.map((p) => {
    const r = summary.personas.find((x) => x.persona === p.key)
    return { name: p.title, color: p.color, perSol: (r?.rewardsPerSol ?? 0) * 1000, rewards: r?.rewardsSol ?? 0, invested: r?.investedSol ?? 0 }
  })
  const holders = rows[0]
  return (
    <Section title="Who got paid?" aside={<span className="text-xs text-muted">rewards per SOL invested · final</span>}>
      {!show ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-muted">Results appear when the replay finishes.</p>
          <button onClick={onShow} className="text-sm text-teal underline">
            Show them now
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#8ba29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8ba29e', fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#10171a', border: '1px solid #1f2b2f', borderRadius: 12, color: '#e4eeec' }}
                  formatter={(v) => [`${Number(v ?? 0).toFixed(2)} mSOL per SOL`, 'rewards']}
                />
                <RBar dataKey="perSol" radius={[6, 6, 0, 0]}>
                  {rows.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="num text-3xl font-semibold text-teal">{holders.perSol.toFixed(1)}</div>
              <div className="text-muted">mSOL of rewards per SOL for holders</div>
            </div>
            <div>
              <div className="num text-3xl font-semibold">0</div>
              <div className="text-muted">for snipers and flippers: dumping forfeits every point</div>
            </div>
            <p className="text-xs text-faint">
              {summary.blockedTotal} transfers blocked. Snipers and flippers still sold for more than they paid: Holdfast doesn’t stop profit-taking,
              it reserves the fee stream for those who stay. Rewards: {summary.rewardsPaidSol.round1BondingFees.toFixed(4)} SOL from bonding fees, then{' '}
              {summary.rewardsPaidSol.round2LpFees.toFixed(4)} SOL from DAMM v2 LP fees after graduation.
            </p>
          </div>
        </div>
      )}
    </Section>
  )
}

function FinalLeaderboard({ mint, bots, network }: { mint: string; bots: BotNames; network: string }) {
  const { connection } = useConnection()
  const { data } = usePoll(async () => (network === NETWORK ? getLeaderboard(connection, new PublicKey(mint), 12) : []), 60_000, [mint])
  if (!data || data.length === 0) return null
  return (
    <Section title="Final standings, read from chain" aside={<span className="text-xs text-muted">frozen at graduation</span>}>
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        {data.map((r) => {
          const b = bots[r.owner.toBase58()]
          return (
            <div key={r.holder.toBase58()} className="num flex items-center gap-3 border-t border-line py-2 text-sm">
              <span className="w-5 text-faint">{r.rank}</span>
              <span className="flex-1 font-mono text-xs">{b?.name ?? r.owner.toBase58().slice(0, 6)}</span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-teal" style={{ width: `${Math.min(100, r.share * 100 * 3)}%` }} />
              </div>
              <span className="w-14 text-right">{pct(r.share, 1)}</span>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
