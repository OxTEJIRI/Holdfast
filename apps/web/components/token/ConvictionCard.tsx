'use client'
import { forfeitPreview, pointsAt, projectedShare } from '@holdfast/sdk'
import { ConvictionRing } from '@/components/ConvictionRing'
import { Section, Stat } from '@/components/ui'
import { clock, compact, pct, timeOfDay, tokens } from '@/lib/format'
import type { LaunchData } from '@/lib/useLaunch'

export function ConvictionCard({ d, now, connected }: { d: LaunchData; now: number; connected: boolean }) {
  const h = d.holder
  if (!connected || !h) {
    return (
      <Section title="Your conviction">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <ConvictionRing share={0} label="—" caption={connected ? 'not registered yet' : 'connect a wallet'} size={180} />
          <p className="max-w-xs text-sm text-muted">
            Your first buy registers your wallet. From then on every token you hold earns points every second, and points become your share of the
            launch&apos;s fees forever.
          </p>
        </div>
      </Section>
    )
  }
  const ts = d.launch.finalized ? d.launch.finalTs.toNumber() : now
  const share = projectedShare(h, d.launch, now)
  const points = pointsAt(h, ts)
  // once the curve completes DBC removes the hook: locks no longer apply and points are frozen
  const graduated = d.curveComplete || d.launch.finalized
  const lockLeft = h.unlockTs.toNumber() - now
  const locked = lockLeft > 0 && !graduated
  const quarter = forfeitPreview(h, BigInt(h.trackedBalance.toString()) / 4n, now)
  return (
    <Section title="Your conviction" aside={locked ? <span className="text-xs font-medium text-amber">snipe-locked</span> : null}>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ConvictionRing share={share} label={pct(share)} caption={d.launch.finalized ? 'final share of rewards' : 'share if it graduated now'} locked={locked} size={190} />
        <div className="grid flex-1 grid-cols-2 gap-4">
          <Stat label="Points" value={compact(points)} sub="token-units × seconds" />
          <Stat label="Tracked balance" value={tokens(BigInt(h.trackedBalance.toString()))} sub="tokens earning points" />
          {locked ? (
            <Stat label="Unlocks in" value={<span className="text-amber">{clock(lockLeft)}</span>} sub={`at ${timeOfDay(h.unlockTs.toNumber())}`} />
          ) : (
            <Stat label="Lock" value="Free" sub={graduated ? 'hook removed at graduation' : 'you can sell or move'} />
          )}
          {graduated ? (
            <Stat label="Conviction" value="Frozen" sub="selling no longer changes your share" />
          ) : (
            <Stat label="If you sell 25%" value={`−${compact(quarter)}`} sub="points forfeited (25%)" />
          )}
        </div>
      </div>
    </Section>
  )
}
