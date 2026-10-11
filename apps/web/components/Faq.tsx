import type { ReactNode } from 'react'
import { CAPS } from '@holdfast/sdk'

const win = CAPS.maxWindowSecs / 60
const lock = CAPS.maxSnipeLockSecs / 60

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'What is conviction, and how is it calculated?',
    a: (
      <>
        <p>
          Conviction is <b>how much you hold × how long you hold it</b>. Every transfer settles your points first (tracked balance × seconds since the
          last update) and then applies the move, so your points grow every second you hold, with no action from you.
        </p>
        <p>
          Your share of the rewards is your points divided by everyone’s points. Points are linear in balance, so splitting a bag across wallets gains
          nothing.
        </p>
      </>
    ),
  },
  {
    q: 'Can Holdfast block me from selling?',
    a: (
      <>
        <p>
          Only at the start, and only for a bounded time. The rules are fixed at launch, and the program caps them: an opening window of at most{' '}
          <b>{win} minutes</b>, then a snipe-lock of at most <b>{lock} minutes</b> on tokens bought inside that window.
        </p>
        <p>
          After <b>launch + window + lock (40 minutes worst case) the hook cannot reject any transfer</b>. Sells outside the window are never blocked, and
          tokens bought after the window are never locked. The hook can reject in exactly three ways: <code>RecipientNotRegistered</code> and{' '}
          <code>MaxWalletExceeded</code> (window only) and <code>SnipeLocked</code> (only until your lock ends, and the error tells you when).
        </p>
      </>
    ),
  },
  {
    q: 'What happens at graduation?',
    a: (
      <p>
        When the bonding curve completes, Meteora’s DBC program <b>revokes the transfer hook</b>, so the token becomes a plain Token-2022 token that
        trades anywhere. The liquidity moves to a <b>DAMM v2</b> pool (Compounding mode, with the partner LP locked forever). Holdfast freezes everyone’s
        conviction at that moment; from then on it is the fixed basis for splitting fees.
      </p>
    ),
  },
  {
    q: 'Where do the rewards come from, and who gets them?',
    a: (
      <>
        <p>
          From the launch’s own trading fees: first the <b>bonding-curve fees</b>, then the <b>DAMM v2 LP fees</b> for as long as the token trades. The
          fee stream is split between holders, the creator and a treasury (the default is 60 / 30 / 10, set at launch).
        </p>
        <p>
          The holders’ part is paid out pro rata by final conviction points, in SOL. You claim it yourself from the token page. Only wallets registered
          with Holdfast earn; registration happens automatically on your first buy through the app or SDK.
        </p>
      </>
    ),
  },
  {
    q: 'What does selling cost me?',
    a: (
      <p>
        You forfeit points in proportion to what you move out. Sell 30% of your tracked balance and you lose 30% of your points; sell everything and you
        are back to zero. Moving tokens to another wallet counts the same, so it is not a way to hide a bag. The token page shows a preview of the loss
        before you sell. Selling is never forbidden after the opening rules end: it only costs you your place in the fee stream.
      </p>
    ),
  },
  {
    q: 'Is it live on mainnet?',
    a: (
      <>
        <p>
          <b>No. This is a devnet demo, and it is not audited.</b> The program was reviewed by its builders only (see{' '}
          <a href="https://github.com/OxTEJIRI/Holdfast/blob/main/docs/SECURITY.md">docs/SECURITY.md</a>), and that review found and fixed a real
          bug. It is tested against the real Meteora programs on a local validator, and end to end in a browser on devnet.
        </p>
        <p>
          Known limits: the program is still upgradeable by its deployer (it would be made immutable before any mainnet use), and devnet fee splitting
          trusts a keeper (see below). Do not put real money behind it.
        </p>
      </>
    ),
  },
  {
    q: 'Why can’t I trade it on Jupiter during the bonding phase?',
    a: (
      <>
        <p>
          A transfer hook needs extra accounts on every transfer: here, the sender’s and receiver’s Holdfast records. The stock Meteora DBC SDK fills
          those in with placeholder keys, and aggregators generally don’t route hook tokens, so a plain swap fails. Trade through this app or{' '}
          <code>@holdfast/sdk</code> (which patches the accounts).
        </p>
        <p>After graduation the hook is gone and the token trades like any other, including on aggregators.</p>
      </>
    ),
  },
  {
    q: 'How does a launchpad integrate it?',
    a: (
      <p>
        Three calls from <code>@holdfast/sdk</code>: <code>createLaunch</code> (a normal DBC launch on a Token-2022 mint whose hook is Holdfast),{' '}
        <code>buy</code> (registers the buyer on first use and fixes the hook accounts), and <code>claim</code> after graduation. The code is at the top
        of this page. Your launchpad keeps its curve, UI and users.
      </p>
    ),
  },
  {
    q: 'What’s the difference between the devnet and mainnet fee split?',
    a: (
      <>
        <p>
          <b>Devnet uses a keeper.</b> The devnet build of Meteora’s Dynamic Fee Sharing lacks a whitelist entry that hook pools need, so there the
          creator’s wallet claims the fees and deposits the holders’ share. That means holders trust the keeper to deposit honestly. Everything you see on
          devnet, including the Arena, worked this way.
        </p>
        <p>
          <b>Mainnet uses Dynamic Fee Sharing.</b> A Meteora vault is the fee claimer and splits fees on-chain between holders, creator and treasury, with
          no one in the middle. That path is tested end to end against the mainnet program binaries, but it has not been run on mainnet.
        </p>
      </>
    ),
  },
]

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24">
      <h2 className="display text-3xl font-bold tracking-tight">Questions, answered honestly</h2>
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel/60">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-medium hover:bg-panel-2/60 [&::-webkit-details-marker]:hidden">
              {q}
              <svg className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m3.5 6 4.5 4.5L12.5 6" />
              </svg>
            </summary>
            <div className="max-w-3xl space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted [&_a]:text-teal [&_a]:underline [&_b]:font-semibold [&_b]:text-fg [&_code]:rounded [&_code]:bg-panel-2 [&_code]:px-1 [&_code]:text-xs [&_code]:text-fg">
              {a}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
