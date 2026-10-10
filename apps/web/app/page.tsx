import Link from 'next/link'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConvictionRing } from '@/components/ConvictionRing'
import type { ArenaSummary } from '@/lib/arena'

function arena(): ArenaSummary {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', 'arena', 'summary.json'), 'utf8'))
}

export default function Home() {
  const s = arena()
  const per = (p: string) => (s.personas.find((x) => x.persona === p)?.rewardsPerSol ?? 0) * 1000
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-10 pt-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-teal">A conviction layer for Meteora DBC launches</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Launches that reward the people who stay.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Holdfast scores every holder by <span className="text-fg">how much × how long</span> they hold, locks snipers out of the first minutes, and
            turns that score into a perpetual share of the launch’s fees: from the bonding curve, then from the graduated pool, forever.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/arena" className="inline-flex h-11 items-center rounded-xl bg-teal px-5 text-sm font-semibold text-ink">
              Watch the Arena
            </Link>
            <Link href="/launch" className="inline-flex h-11 items-center rounded-xl border border-line bg-panel-2 px-5 text-sm font-semibold">
              Launch a token
            </Link>
            <Link href="/developers" className="inline-flex h-11 items-center rounded-xl px-4 text-sm text-muted hover:text-fg">
              Add it to your launchpad →
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <ConvictionRing share={0.62} size={260} label="62%" caption="of rewards to holders who stayed" />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ['1 · Launch', 'A normal Meteora DBC bonding-curve launch, on a Token-2022 mint whose transfer hook is Holdfast. One extra instruction in the creation transaction.'],
            ['2 · Hold', 'Every transfer updates your conviction points: balance × seconds. Sell 30% of your bag and you forfeit 30% of your points. Moving tokens between wallets forfeits too.'],
            ['3 · Get paid', 'At graduation conviction is frozen. Trading fees (bonding curve, then the DAMM v2 pool) flow to holders pro rata, for as long as the token trades.'],
          ].map(([t, b]) => (
            <div key={t} className="card p-6">
              <div className="font-semibold">{t}</div>
              <p className="mt-2 text-sm text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Provably not a honeypot</h2>
        <p className="mt-2 max-w-2xl text-muted">
          A transfer hook can block sales, so Holdfast bounds that power in the program itself. Every rule is fixed at launch and has a hard cap.
        </p>
        <div className="mt-8">
          <div className="relative grid h-12 grid-cols-[1fr_3fr_4fr] overflow-hidden rounded-xl text-xs font-medium">
            <div className="flex items-center justify-center bg-amber/30 text-amber">window ≤ 10 min</div>
            <div className="flex items-center justify-center bg-amber/10 text-amber">snipe-locks ≤ 30 min</div>
            <div className="flex items-center justify-center bg-teal-soft text-teal">nothing can be blocked</div>
          </div>
          <div className="mt-3 grid gap-4 text-sm text-muted md:grid-cols-3">
            <p>
              <span className="text-fg">Opening window.</span> Only registered wallets receive tokens (no bundles), with an optional max-wallet cap. Buys are
              snipe-locked.
            </p>
            <p>
              <span className="text-fg">Locks expire.</span> A lock only applies to tokens bought in the window, and ends at most 30 minutes later.
            </p>
            <p>
              <span className="text-fg">After 40 minutes, worst case,</span> the hook cannot reject any transfer. At graduation Meteora removes the hook
              entirely.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">The Arena, on devnet</h2>
        <p className="mt-2 max-w-2xl text-muted">27 bots, one real launch. Snipers and flippers against patient holders. Who got paid?</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-6">
            <div className="num text-4xl font-semibold text-teal">{per('holder').toFixed(1)}</div>
            <div className="mt-1 text-sm text-muted">mSOL of rewards per SOL, holders</div>
          </div>
          <div className="card p-6">
            <div className="num text-4xl font-semibold">0</div>
            <div className="mt-1 text-sm text-muted">for snipers and flippers</div>
          </div>
          <div className="card p-6">
            <div className="num text-4xl font-semibold text-amber">{s.blockedTotal}</div>
            <div className="mt-1 text-sm text-muted">snipe-and-dump attempts blocked</div>
          </div>
        </div>
        <Link href="/arena" className="mt-6 inline-block text-sm text-teal underline">
          Replay the run →
        </Link>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Built deep into Meteora</h2>
        <ul className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
          <li><span className="text-fg">Dynamic Bonding Curve:</span> transfer-hook pools, the exponential anti-sniper fee scheduler, dynamic fees.</li>
          <li><span className="text-fg">DAMM v2:</span> graduation into a Compounding pool, with the partner LP permanently locked so its fees flow to holders.</li>
          <li><span className="text-fg">Dynamic Fee Sharing:</span> one vault splits fees between holders, creator and treasury (mainnet).</li>
          <li><span className="text-fg">Token-2022 transfer hook:</span> the Holdfast program scores every transfer, and DBC removes it at graduation.</li>
        </ul>
      </section>
    </div>
  )
}
