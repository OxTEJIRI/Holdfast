'use client'
import { useConnection } from '@solana/wallet-adapter-react'
import { HOLDFAST_PROGRAM_ID } from '@holdfast/sdk'
import { useEffect, useRef, useState } from 'react'
import { NETWORK, RPC_URL, explorer } from '@/lib/config'
import { usePoll } from '@/lib/usePoll'

type Status = { slot: number; ms: number }

/**
 * The network indicator: a live capsule showing the cluster, the current slot ticking forward and the
 * RPC round-trip, with a sonar ring that follows connection health. Hover or focus opens the details.
 */
export function NetworkPill() {
  const { connection } = useConnection()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const last = useRef(0)
  const { data, error } = usePoll<Status>(async () => {
    const t0 = performance.now()
    const slot = await connection.getSlot('confirmed')
    return { slot, ms: Math.round(performance.now() - t0) }
  }, 6000)

  useEffect(() => {
    if (data && data.slot !== last.current) {
      last.current = data.slot
      setTick((t) => t + 1)
    }
  }, [data])

  const health = error ? 'down' : !data ? 'wait' : data.ms > 1200 ? 'slow' : 'ok'
  const color = { ok: '#6ee7c4', slow: '#f6b955', down: '#f27c6b', wait: '#8fb5b0' }[health]
  const host = (() => {
    try {
      return new URL(RPC_URL).host
    } catch {
      return RPC_URL
    }
  })()
  const label = NETWORK === 'mainnet' ? 'MAINNET' : NETWORK === 'devnet' ? 'DEVNET' : 'LOCALNET'

  return (
    <div className="relative hidden md:block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={`${label}, ${health === 'ok' ? 'connected' : health}`}
        className="group relative flex h-10 items-center gap-3 overflow-hidden rounded-full border bg-panel/70 pl-3 pr-4 backdrop-blur transition hover:bg-panel-2"
        style={{ borderColor: `${color}55`, boxShadow: `0 0 26px -10px ${color}` }}
      >
        {/* sweeping scan line */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 animate-[scan_4.5s_linear_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        {/* sonar */}
        <span className="relative grid h-4 w-4 place-items-center" aria-hidden>
          <span className="absolute inset-0 rounded-full" style={{ background: color, opacity: 0.25, animation: 'ping 2.4s ease-out infinite' }} />
          <span className="absolute inset-0 rounded-full" style={{ background: color, opacity: 0.2, animation: 'ping 2.4s ease-out 1.2s infinite' }} />
          <span className="relative h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </span>
        <span className="display text-xs font-bold tracking-[0.2em]" style={{ color }}>
          {label}
        </span>
        {data && (
          <>
            <span className="h-4 w-px bg-line" aria-hidden />
            <span key={tick} className="num font-mono text-[11px] text-muted [animation:rise_0.4s_ease-out]">
              slot {data.slot.toLocaleString('en-US')}
            </span>
            <span className="num font-mono text-[11px]" style={{ color }}>
              {data.ms}ms
            </span>
          </>
        )}
        {!data && !error && <span className="text-[11px] text-muted">connecting…</span>}
        {error ? <span className="text-[11px] text-red">offline</span> : null}
      </button>

      {open && (
        <div role="dialog" className="rise absolute right-0 top-12 z-50 w-72 rounded-2xl border border-teal/20 bg-panel/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="display text-sm font-bold">{label.charAt(0) + label.slice(1).toLowerCase()}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: `${color}22`, color }}>
              {health === 'ok' ? 'connected' : health === 'slow' ? 'slow' : health === 'down' ? 'offline' : 'connecting'}
            </span>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            {[
              ['RPC', host],
              ['Slot', data ? data.slot.toLocaleString('en-US') : '—'],
              ['Round trip', data ? `${data.ms} ms` : '—'],
              ['Program', `${HOLDFAST_PROGRAM_ID.toBase58().slice(0, 6)}…${HOLDFAST_PROGRAM_ID.toBase58().slice(-4)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-faint">{k}</dt>
                <dd className="num font-mono text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <a className="rounded-lg border border-teal/25 px-2.5 py-1.5 text-teal transition hover:bg-teal/10" href={explorer('address', HOLDFAST_PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
              Program on Explorer
            </a>
            {NETWORK === 'devnet' && (
              <a className="rounded-lg border border-line px-2.5 py-1.5 text-muted transition hover:text-fg" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
                Get devnet SOL
              </a>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-faint">
            {NETWORK === 'devnet' ? 'Test network: tokens here have no value. Switch your wallet to devnet to trade.' : 'Live network: transactions spend real SOL.'}
          </p>
        </div>
      )}
    </div>
  )
}
