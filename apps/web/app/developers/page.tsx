import { CAPS, HOLDFAST_PROGRAM_ID } from '@holdfast/sdk'
import { GITHUB_URL } from '@/lib/config'

export const metadata = { title: 'Developers · Holdfast' }

const code = `import { createLaunch, buy, crank, claim } from '@holdfast/sdk'

// 1. Launch: DFS fee vault → DBC hook config → pool + Holdfast launch
const launch = await createLaunch(conn, {
  creator, treasury, name: 'My Token', symbol: 'MYT', uri,
  preset: 'fairLaunch', network: 'mainnet',
})
for (const step of launch.steps) {
  await signAndSend(await step.build(), step.signers)   // one wallet prompt each
}

// 2. Trade: registers the buyer on first use, fixes the hook accounts
await signAndSend(await buy(conn, { owner, mint: launch.mint, solIn: 0.1 }))

// 3. Get paid: after graduation, route fees to holders and claim in SOL
for (const tx of await crank(conn, { mint, signer: creator })) await signAndSend(tx)
await signAndSend(await claim(conn, { owner, mint }))`

const read = `import { getLaunch, getHolderForOwner, getLeaderboard, projectedShare, claimable, explainError } from '@holdfast/sdk'

const launch = await getLaunch(conn, mint)              // rules, totals, protectionEndsAt
const me = await getHolderForOwner(conn, mint, owner)   // points, tracked balance, unlockTs
projectedShare(me, launch)                              // live share of all future rewards
claimable(me, launch)                                   // lamports claimable now
await getLeaderboard(conn, mint, 20)

try { await send(tx) } catch (e) { toast(explainError(e)) }  // "Snipe-locked until 14:32:05"`

export default function Developers() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Add Holdfast to your DBC launchpad</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Three calls with <code className="text-fg">@holdfast/sdk</code>. Your launchpad keeps its curve, its UI and its users; holders get paid for
          staying.
        </p>
      </div>

      <Block title="Three calls">{code}</Block>
      <Block title="Show conviction in your UI">{read}</Block>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6 text-sm">
          <h2 className="font-semibold">Program</h2>
          <p className="mt-2 break-all font-mono text-xs text-teal">{HOLDFAST_PROGRAM_ID.toBase58()}</p>
          <ul className="mt-4 space-y-2 text-muted">
            <li><span className="text-fg">init_launch:</span> right after DBC pool creation, same transaction.</li>
            <li><span className="text-fg">register:</span> idempotent; prepended to a buyer’s first buy.</li>
            <li><span className="text-fg">execute:</span> the Token-2022 transfer hook (~13k CU).</li>
            <li><span className="text-fg">finalize / sync_rewards / deposit_rewards / claim:</span> graduation and rewards.</li>
          </ul>
        </div>
        <div className="card p-6 text-sm">
          <h2 className="font-semibold">Safety caps (enforced on-chain)</h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li>Opening window ≤ <span className="num text-fg">{CAPS.maxWindowSecs / 60} min</span></li>
            <li>Snipe-lock ≤ <span className="num text-fg">{CAPS.maxSnipeLockSecs / 60} min</span></li>
            <li>Max wallet off or ≥ <span className="num text-fg">{CAPS.minMaxWalletBps / 100}%</span></li>
            <li>After ≤ 40 min the hook cannot reject any transfer; at graduation DBC revokes it.</li>
            <li>Fixed supply required (mint authority revoked); rules can’t change after launch.</li>
          </ul>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold">Accounts</h2>
        <div className="mt-5 grid gap-3 text-xs sm:grid-cols-4">
          {[
            ['Launch', 'PDA ["launch", mint]', 'rules, totals, final points, reward accumulator'],
            ['Holder', 'PDA ["holder", token account]', 'tracked balance, points, unlock time, claimed'],
            ['Rewards vault', 'PDA ["rewards_vault", mint]', 'wSOL paid out to holders'],
            ['Meta list', 'PDA ["extra-account-metas", mint]', 'what Token-2022 passes to the hook'],
          ].map(([t, s, b]) => (
            <div key={t} className="rounded-xl border border-line bg-panel-2 p-4">
              <div className="font-semibold text-fg">{t}</div>
              <div className="mt-1 font-mono text-teal">{s}</div>
              <div className="mt-2 text-muted">{b}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted">
          Holder records are keyed by the token-account <em>address</em>, so the accounts a transfer needs are deterministic. During the bonding
          phase, trade through the SDK (or its <code className="text-fg">patchHookAccounts</code>): the stock DBC SDK resolves hook accounts with
          placeholder keys. After graduation the hook is gone and the token trades anywhere.
        </p>
      </div>

      <a href={GITHUB_URL} className="inline-block text-sm text-teal underline">
        Source, tests and the full design on GitHub →
      </a>
    </div>
  )
}

function Block({ title, children }: { title: string; children: string }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <pre className="overflow-x-auto rounded-2xl border border-line bg-panel p-5 font-mono text-[13px] leading-relaxed text-fg">
        <code>{children}</code>
      </pre>
    </section>
  )
}
