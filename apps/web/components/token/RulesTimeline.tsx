'use client'
import { Bar, Section } from '@/components/ui'
import { clock, pct, sol, timeOfDay } from '@/lib/format'
import type { LaunchData } from '@/lib/useLaunch'

/** The provable-safety timeline: window → locks → free trading → graduation, each with a countdown. */
export function RulesTimeline({ d, now }: { d: LaunchData; now: number }) {
  const l = d.launch
  const start = l.launchTs.toNumber()
  const steps = [
    {
      title: 'Opening window',
      at: l.windowEndsAt,
      body: `Only registered wallets can receive tokens${l.maxWalletBps ? `, and no wallet may hold more than ${l.maxWalletBps / 100}% of supply` : ''}. Buys in the window are snipe-locked for ${clock(l.snipeLockSecs)}.`,
    },
    {
      title: 'Snipe-locks',
      at: l.protectionEndsAt,
      body: 'Wallets that bought in the window can’t sell or move tokens until their lock ends.',
    },
    {
      title: 'Free trading',
      at: null,
      body: 'From here the hook can’t reject any transfer. It only keeps score.',
    },
  ]
  return (
    <Section title="Rules" aside={<span className="text-xs text-muted">fixed at launch · can’t be changed</span>}>
      <ol className="space-y-4">
        {steps.map((s, i) => {
          // graduation removes the hook: anything still pending ends there
          const done = (s.at !== null && now >= s.at) || (d.curveComplete && s.at !== null)
          const active = !done && (i === 0 || now >= (steps[i - 1].at ?? 0))
          return (
            <li key={s.title} className="flex gap-3">
              <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${done ? 'bg-faint' : active ? 'bg-amber' : 'bg-teal'}`} />
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`font-medium ${done ? 'text-muted line-through decoration-faint' : ''}`}>{s.title}</span>
                  {s.at !== null && (
                    <span className="num text-xs text-muted">
                      {now < s.at && d.curveComplete ? 'ended at graduation' : done ? `ended ${timeOfDay(s.at)}` : `${clock(s.at - now)} left · ends ${timeOfDay(s.at)}`}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted">{s.body}</p>
              </div>
            </li>
          )
        })}
        <li className="flex gap-3">
          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${d.curveComplete ? 'bg-faint' : 'bg-teal'}`} />
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">Graduation</span>
              <span className="num text-xs text-muted">
                {sol(d.quoteReserve, 3)} / {sol(d.threshold, 2)} SOL · {pct(d.progress, 1)}
              </span>
            </div>
            <Bar value={d.progress} className="mt-2" />
            <p className="mt-2 text-sm text-muted">
              When the curve completes, Meteora removes the hook entirely and the token migrates to a DAMM v2 pool. Conviction is frozen then; fees keep
              flowing to holders forever.
            </p>
          </div>
        </li>
      </ol>
      <p className="mt-5 rounded-xl border border-teal/30 bg-teal-soft/30 p-3 text-sm">
        <span className="font-semibold text-teal">Provably not a honeypot:</span> after {timeOfDay(l.protectionEndsAt)} (launch +{' '}
        {clock(l.protectionEndsAt - start)}) the hook cannot reject any transfer. The program caps this at 40 minutes.
      </p>
    </Section>
  )
}
