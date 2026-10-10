'use client'
import { useMemo, useState } from 'react'
import { ConvictionRing } from './ConvictionRing'
import { CountUp } from './CountUp'

/**
 * Try the mechanic. Conviction = tokens × time; selling forfeits points in proportion. Nineteen other
 * holders hold the same bag for the whole hour. Your share of 1 SOL of fees follows from the points.
 */
const BAG = 100 // tokens, arbitrary units
const OTHERS = 19 * BAG * 60 // 19 holders × full hour (minutes)
const FEES_SOL = 1

export function HoldSimulator() {
  const [minutes, setMinutes] = useState(60)
  const [sellPct, setSellPct] = useState(0)
  const [sellAt, setSellAt] = useState(30)

  const { share, sold } = useMemo(() => {
    // hold `minutes`; if selling, sell `sellPct` at minute `sellAt` (forfeits that share of points so far), then keep the rest
    const at = Math.min(sellAt, minutes)
    const before = BAG * at
    const forfeit = before * (sellPct / 100)
    const remaining = BAG * (1 - sellPct / 100)
    const mine = before - forfeit + remaining * (minutes - at)
    return { share: mine / (mine + OTHERS), sold: sellPct > 0 }
  }, [minutes, sellPct, sellAt])

  return (
    <div className="card card-hot grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
      <div className="space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-teal">Try it</div>
          <h3 className="display mt-1 text-2xl font-semibold">What is staying worth?</h3>
          <p className="mt-1 max-w-md text-sm text-muted">
            You and 19 others hold 100 tokens each. 1 SOL of fees is paid out by conviction: tokens × time held. Move the sliders.
          </p>
        </div>
        <Slider id="sim-hold" label="You hold for" value={minutes} min={1} max={60} unit=" min" onChange={setMinutes} />
        <Slider id="sim-sell" label="Then sell" value={sellPct} min={0} max={100} step={5} unit="% of your bag" onChange={setSellPct} />
        {sold && <Slider id="sim-sellat" label="…at minute" value={Math.min(sellAt, minutes)} min={0} max={minutes} unit="" onChange={setSellAt} />}
        <p className="min-h-[2.5rem] text-sm text-muted">
          {!sold
            ? 'Patience compounds: each extra minute adds the same points as the last, so the share climbs the longer you stay.'
            : sellPct === 100
              ? 'Selling everything resets your points to zero. Whatever you earned by waiting is forfeited.'
              : `Selling ${sellPct}% forfeits ${sellPct}% of the points you had built by then.`}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <ConvictionRing share={share} size={230} label={`${(share * 100).toFixed(1)}%`} caption="of the fees" />
        <div className="text-center">
          <div className="display text-3xl font-bold text-grad">
            <CountUp to={share * FEES_SOL} digits={3} suffix=" SOL" duration={600} />
          </div>
          <div className="text-xs text-faint">your cut of 1 SOL of fees</div>
        </div>
      </div>
    </div>
  )
}

function Slider({ id, label, value, min, max, step = 1, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="text-fg">{label}</span>
        <span className="num display text-lg font-semibold text-teal">
          {value}
          <span className="text-sm font-normal text-muted">{unit}</span>
        </span>
      </span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 h-2 w-full cursor-pointer" />
    </label>
  )
}
