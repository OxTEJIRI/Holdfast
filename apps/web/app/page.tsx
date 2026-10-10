import Link from 'next/link'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CountUp } from '@/components/CountUp'
import { HoldSimulator } from '@/components/HoldSimulator'
import { Kelp } from '@/components/Kelp'
import type { ArenaSummary } from '@/lib/arena'

function arena(): ArenaSummary {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', 'arena', 'summary.json'), 'utf8'))
}

export default function Home() {
  const s = arena()
  const per = (p: string) => (s.personas.find((x) => x.persona === p)?.rewardsPerSol ?? 0) * 1000
  return (
    <div className="space-y-28">
      {/* hero: the thesis, over the kelp */}
      <section className="relative -mx-4 overflow-hidden px-4 pb-10 pt-10 sm:pt-16">
        <Kelp className="absolute inset-x-0 bottom-0 h-[26rem] opacity-90 [mask-image:radial-gradient(ellipse_70%_100%_at_78%_100%,black_35%,transparent_80%)]" />
        <div className="relative max-w-3xl stagger">
          <p className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-teal">
            <span className="relative h-1.5 w-1.5 rounded-full bg-teal text-teal ping" />
            A conviction layer for Meteora DBC launches
          </p>
          <h1 className="display mt-6 text-5xl font-extrabold leading-[0.98] sm:text-7xl">
            Launches that reward the people who <span className="text-grad">stay</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            A holdfast is the root that keeps kelp fixed to the rock while the tide pulls. Holdfast scores every holder by{' '}
            <span className="text-fg">how much × how long</span> they hold, shuts snipers out of the first minutes, and pays the score out as a
            perpetual share of the launch’s fees.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/arena" className="inline-flex h-12 items-center rounded-xl bg-gradient-to-br from-teal to-kelp px-6 text-sm font-bold text-ink shadow-[0_0_34px_-8px_rgba(110,231,196,0.8)] transition hover:brightness-110">
              Watch the Arena
            </Link>
            <Link href="/launch" className="inline-flex h-12 items-center rounded-xl border border-teal/30 bg-panel/60 px-6 text-sm font-semibold backdrop-blur transition hover:border-teal/70">
              Launch a token
            </Link>
            <Link href="/developers" className="inline-flex h-12 items-center px-3 text-sm text-muted hover:text-fg">
              Add it to your launchpad →
            </Link>
          </div>
        </div>
        <div className="relative mt-16 grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
          {[
            [per('holder'), 1, 'mSOL earned per SOL by holders'],
            [s.blockedTotal, 0, 'snipe-and-dump attempts blocked'],
            [27, 0, 'bots, one real launch on devnet'],
          ].map(([n, d, l]) => (
            <div key={String(l)}>
              <div className="display text-3xl font-extrabold sm:text-5xl">
                <CountUp to={n as number} digits={d as number} />
              </div>
              <div className="mt-1 text-xs leading-snug text-muted sm:text-sm">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <HoldSimulator />

      {/* how it works: a real sequence, so numbered */}
      <section>
        <h2 className="display text-3xl font-bold sm:text-4xl">Three moves.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ['Launch', 'A normal Meteora DBC bonding-curve launch on a Token-2022 mint whose transfer hook is Holdfast. One extra instruction in the creation transaction.', 'M4 20 L12 6 L20 20 Z'],
            ['Hold', 'Every transfer updates your conviction: balance × seconds. Sell 30% of your bag and you forfeit 30% of your points. Moving tokens between wallets forfeits too.', 'M12 3 V21 M7 8 C7 13 17 11 17 16'],
            ['Get paid', 'At graduation conviction is frozen. Trading fees from the bonding curve, then the DAMM v2 pool, flow to holders pro rata for as long as the token trades.', 'M4 12 H20 M14 6 L20 12 L14 18'],
          ].map(([t, b, path], i) => (
            <div key={t} className="card group p-6 transition hover:-translate-y-1 hover:border-teal/40">
              <div className="flex items-center justify-between">
                <span className="display text-4xl font-extrabold text-teal/30 transition group-hover:text-teal/70">{i + 1}</span>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-teal)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={path} />
                </svg>
              </div>
              <div className="display mt-4 text-xl font-semibold">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* provable safety: the water column */}
      <section className="card overflow-hidden p-6 sm:p-10">
        <h2 className="display text-3xl font-bold sm:text-4xl">Provably not a honeypot.</h2>
        <p className="mt-3 max-w-2xl text-muted">
          A transfer hook can block sales, so Holdfast bounds that power in the program itself. Every rule is fixed at launch and has a hard cap.
        </p>
        <div className="mt-10">
          <div className="grid h-16 grid-cols-[1fr_3fr_4fr] overflow-hidden rounded-2xl text-xs font-semibold">
            <div className="flex items-center justify-center bg-gradient-to-b from-amber/45 to-amber/20 text-amber">window ≤ 10 min</div>
            <div className="flex items-center justify-center bg-gradient-to-b from-amber/20 to-teal-soft/70 text-amber">snipe-locks ≤ 30 min</div>
            <div className="flex items-center justify-center bg-gradient-to-b from-teal-soft to-teal-deep/50 text-teal">nothing can be blocked</div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint">
            <span>surface · launch</span>
            <span>10 min</span>
            <span>40 min, worst case</span>
            <span>deep · forever</span>
          </div>
          <div className="mt-6 grid gap-6 text-sm text-muted md:grid-cols-3">
            <p><span className="text-fg">Opening window.</span> Only registered wallets receive tokens (no bundles), with an optional max-wallet cap. Buys are snipe-locked.</p>
            <p><span className="text-fg">Locks expire.</span> A lock only applies to tokens bought in the window and ends at most 30 minutes later.</p>
            <p><span className="text-fg">After 40 minutes, worst case,</span> the hook cannot reject any transfer. At graduation Meteora removes the hook entirely.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="display text-3xl font-bold sm:text-4xl">The Arena, on devnet.</h2>
        <p className="mt-3 max-w-2xl text-muted">27 bots, one real launch. Snipers, a bundler and flippers against ten patient holders. Who got paid?</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="card card-hot p-6">
            <div className="display text-5xl font-extrabold text-grad"><CountUp to={per('holder')} digits={1} /></div>
            <div className="mt-2 text-sm text-muted">mSOL of rewards per SOL: holders</div>
          </div>
          <div className="card p-6">
            <div className="display text-5xl font-extrabold">0</div>
            <div className="mt-2 text-sm text-muted">for snipers and flippers: dumping forfeits every point</div>
          </div>
          <div className="card p-6">
            <div className="display text-5xl font-extrabold text-amber"><CountUp to={s.blockedTotal} /></div>
            <div className="mt-2 text-sm text-muted">transfers blocked inside the window and locks</div>
          </div>
        </div>
        <Link href="/arena" className="mt-8 inline-flex h-11 items-center rounded-xl border border-teal/30 px-5 text-sm font-semibold text-teal transition hover:bg-teal/10">
          Replay the run →
        </Link>
      </section>

      <section className="card p-6 sm:p-10">
        <h2 className="display text-2xl font-bold sm:text-3xl">Built deep into Meteora.</h2>
        <ul className="mt-6 grid gap-x-10 gap-y-5 text-sm text-muted sm:grid-cols-2">
          <li><span className="text-fg">Dynamic Bonding Curve:</span> transfer-hook pools, the exponential anti-sniper fee scheduler, dynamic fees.</li>
          <li><span className="text-fg">DAMM v2:</span> graduation into a Compounding pool, with the partner LP permanently locked so its fees flow to holders.</li>
          <li><span className="text-fg">Dynamic Fee Sharing:</span> one vault splits fees between holders, creator and treasury (mainnet).</li>
          <li><span className="text-fg">Token-2022 transfer hook:</span> the Holdfast program scores every transfer, and DBC removes it at graduation.</li>
        </ul>
      </section>
    </div>
  )
}
