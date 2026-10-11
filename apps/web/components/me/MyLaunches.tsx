'use client'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { claimable, pointsAt, projectedShare } from '@holdfast/sdk'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PHASE_LABEL, phaseOf } from '@/components/token/phase'
import { Button, Section } from '@/components/ui'
import { compact, pct, short, sol } from '@/lib/format'
import { type MineRow, loadMine, loadMints } from '@/lib/mine'
import { readRecent } from '@/lib/recent'
import { useNow } from '@/lib/useNow'

type Load<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; rows: T[] }

export function MyLaunches() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const now = useNow()
  const key = publicKey?.toBase58()

  const [mine, setMine] = useState<Load<MineRow>>({ status: 'idle', rows: [] })
  const [recent, setRecent] = useState<Load<MineRow>>({ status: 'idle', rows: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!publicKey) {
      setMine({ status: 'idle', rows: [] })
      return
    }
    let alive = true
    setMine({ status: 'loading', rows: [] })
    loadMine(connection, publicKey).then(
      (rows) => alive && setMine({ status: 'ready', rows }),
      () => alive && setMine({ status: 'error', rows: [] }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, key, attempt])

  // device-local list: only a shortcut, so a failure here is silent
  useEffect(() => {
    const mints = readRecent()
    if (mints.length === 0) {
      setRecent({ status: 'ready', rows: [] })
      return
    }
    let alive = true
    setRecent({ status: 'loading', rows: [] })
    loadMints(connection, mints, publicKey ?? null).then(
      (rows) => {
        // keep the recency order the device stored
        const order = new Map(mints.map((m, i) => [m, i]))
        rows.sort((a, b) => (order.get(a.mint.toBase58()) ?? 0) - (order.get(b.mint.toBase58()) ?? 0))
        if (alive) setRecent({ status: 'ready', rows })
      },
      () => alive && setRecent({ status: 'ready', rows: [] }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, key])

  const mineMints = new Set(mine.rows.map((r) => r.mint.toBase58()))
  const recentOnly = recent.rows.filter((r) => !mineMints.has(r.mint.toBase58()))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-5xl font-extrabold tracking-tight">
          My <span className="text-grad">launches</span>
        </h1>
        <p className="mt-2 max-w-2xl text-muted">Every Holdfast token you launched or hold on devnet, with your conviction and what you can claim.</p>
      </div>

      {!publicKey && (
        <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="max-w-sm text-muted">Connect a wallet to see the launches you created and the tokens you hold. Nothing is signed or sent.</p>
          <Button onClick={() => setVisible(true)}>Select Wallet</Button>
        </div>
      )}

      {publicKey && mine.status === 'loading' && <Skeleton />}

      {publicKey && mine.status === 'error' && (
        <div className="card flex flex-col items-center gap-4 px-6 py-10 text-center" role="alert">
          <p className="text-muted">Couldn’t load your launches. The public devnet RPC may be busy.</p>
          <Button kind="ghost" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </Button>
        </div>
      )}

      {publicKey && mine.status === 'ready' && mine.rows.length === 0 && (
        <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="max-w-sm text-muted">
            This wallet hasn’t launched or bought a Holdfast token yet. <span className="num text-faint">{short(publicKey.toBase58(), 4)}</span>
          </p>
          <Link href="/launch" className="text-sm text-teal underline">
            Launch a token →
          </Link>
        </div>
      )}

      {mine.status === 'ready' && mine.rows.length > 0 && (
        <>
          <Section title="Your tokens" aside={<span className="num text-xs text-muted">{mine.rows.length} · newest first</span>}>
            <List rows={mine.rows} now={now} empty="" />
          </Section>
        </>
      )}

      {recent.status === 'loading' && !publicKey && <Skeleton rows={1} />}
      {recentOnly.length > 0 && (
        <Section title="Recently opened on this device" aside={<span className="text-xs text-muted">saved in this browser</span>}>
          <List rows={recentOnly} now={now} empty="" />
        </Section>
      )}
    </div>
  )
}

function List({ rows, now, empty }: { rows: MineRow[]; now: number; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.mint.toBase58()}>
          <Row r={r} now={now} />
        </li>
      ))}
    </ul>
  )
}

function Row({ r, now }: { r: MineRow; now: number }) {
  const phase = phaseOf(r, now)
  const h = r.holder
  const ts = r.launch.finalized ? r.launch.finalTs.toNumber() : now
  const owed = h && r.launch.finalized ? claimable(h, r.launch) : 0n
  const mint = r.mint.toBase58()
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        {r.meta.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.meta.image} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-line bg-panel-2 object-cover" />
        ) : (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-soft font-bold text-teal">{r.meta.symbol.slice(0, 2)}</div>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {r.meta.name === 'Unnamed' ? short(mint, 4) : r.meta.name} <span className="text-muted">{r.meta.symbol === '???' ? '' : `$${r.meta.symbol}`}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {r.creator && <Badge tone="teal">Creator</Badge>}
            {h && <Badge tone="teal">Holder</Badge>}
            <Badge tone={phase === 'window' || phase === 'locks' ? 'amber' : 'teal'}>{PHASE_LABEL[phase]}</Badge>
          </div>
        </div>
      </div>

      <dl className="num grid flex-1 basis-60 grid-cols-3 gap-3 text-sm">
        <Cell label="Points" value={h ? compact(pointsAt(h, ts)) : '—'} />
        <Cell label="Share" value={h ? pct(projectedShare(h, r.launch, now), 1) : '—'} />
        <Cell label="Claimable" value={r.launch.finalized ? `${sol(owed, 4)} SOL` : '—'} accent={owed > 0n} />
      </dl>

      <Link href={`/t/${mint}`} className="h-10 shrink-0 rounded-xl border border-teal/30 px-4 text-sm font-semibold leading-10 text-teal transition hover:border-teal hover:bg-teal/10">
        Open
      </Link>
    </div>
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className={`mt-0.5 truncate font-semibold ${accent ? 'text-teal' : ''}`}>{value}</dd>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'teal' | 'amber'; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone === 'amber' ? 'border-amber/40 bg-amber-soft text-amber' : 'border-teal/30 bg-teal-soft text-teal'}`}
    >
      {children}
    </span>
  )
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[4.75rem] animate-pulse rounded-2xl bg-panel motion-reduce:animate-none" />
      ))}
    </div>
  )
}
