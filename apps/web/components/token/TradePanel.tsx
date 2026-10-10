'use client'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { buy, explainError, forfeitPreview, sell, swapGraduated } from '@holdfast/sdk'
import { useState } from 'react'
import { celebrate } from '@/components/Celebrate'
import { useToast } from '@/components/Toast'
import { Button, Section } from '@/components/ui'
import { clock, compact, sol, timeOfDay, tokens } from '@/lib/format'
import { sendWithWallet } from '@/lib/send'
import type { LaunchData } from '@/lib/useLaunch'
import type { Phase } from './phase'

const SLIPPAGE_BPS = 500

export function TradePanel({ d, now, phase, onDone }: { d: LaunchData; now: number; phase: Phase; onDone: () => void }) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const toast = useToast()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [solIn, setSolIn] = useState('0.05')
  const [sellPct, setSellPct] = useState(25)
  const [busy, setBusy] = useState(false)
  const mint = d.launch.mint
  const h = d.holder
  const lockLeft = h && !d.curveComplete ? h.unlockTs.toNumber() - now : 0
  const sellAmount = (d.tokenBalance * BigInt(sellPct)) / 100n
  const graduated = phase === 'graduated'
  const onDamm = phase === 'migrated'

  async function run(label: string, build: () => Promise<import('@solana/web3.js').Transaction>) {
    if (!wallet.publicKey) return
    setBusy(true)
    try {
      const sig = await sendWithWallet(connection, wallet, await build())
      toast({ kind: 'ok', text: label, sig })
      if (side === 'buy') celebrate({ text: 'In.', sub: 'conviction starts now' })
      onDone()
    } catch (e) {
      toast({ kind: 'error', text: explainError(e) })
    } finally {
      setBusy(false)
    }
  }

  const doBuy = () => {
    const amount = Number(solIn)
    if (!(amount > 0)) return toast({ kind: 'error', text: 'Enter an amount of SOL' })
    const owner = wallet.publicKey!
    return run(
      `Bought with ${amount} SOL${!h && !onDamm ? ' (wallet registered)' : ''}`,
      () => (onDamm ? swapGraduated(connection, { owner, mint, solIn: amount, slippageBps: SLIPPAGE_BPS }) : buy(connection, { owner, mint, solIn: amount, slippageBps: SLIPPAGE_BPS })),
    )
  }
  const doSell = () => {
    if (sellAmount === 0n) return toast({ kind: 'error', text: 'Nothing to sell' })
    const owner = wallet.publicKey!
    return run(
      `Sold ${sellPct}% of your tokens`,
      () => (onDamm ? swapGraduated(connection, { owner, mint, tokensIn: sellAmount, slippageBps: SLIPPAGE_BPS }) : sell(connection, { owner, mint, tokensIn: sellAmount, slippageBps: SLIPPAGE_BPS })),
    )
  }

  return (
    <Section title={onDamm ? 'Trade on DAMM v2' : 'Trade'} aside={<span className="text-xs text-muted">{onDamm ? 'hook removed · plain token' : 'bonding curve'}</span>}>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-ink p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`h-9 rounded-lg text-sm font-semibold capitalize ${side === s ? 'bg-panel-2 text-fg' : 'text-muted'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {graduated ? (
        <p className="text-sm text-muted">The curve is complete. Trading resumes on DAMM v2 once the pool is migrated (see Rewards).</p>
      ) : side === 'buy' ? (
        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-wider text-muted" htmlFor="sol-in">
            You pay (SOL)
          </label>
          <input
            id="sol-in"
            inputMode="decimal"
            value={solIn}
            onChange={(e) => setSolIn(e.target.value)}
            className="num h-12 w-full rounded-xl border border-line bg-ink px-4 text-lg outline-none focus:border-teal"
          />
          <div className="flex gap-2">
            {['0.01', '0.05', '0.1', '0.5'].map((x) => (
              <button key={x} onClick={() => setSolIn(x)} className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:text-fg">
                {x}
              </button>
            ))}
          </div>
          {phase === 'window' && d.launch.maxWalletBps > 0 && (
            <p className="text-xs text-amber">
              Opening window: you can hold at most {d.launch.maxWalletBps / 100}% of supply, and what you buy now is locked for {clock(d.launch.snipeLockSecs)}.
            </p>
          )}
          {!h && !onDamm && <p className="text-xs text-muted">Your first buy also registers your wallet (one-time account rent, about 0.003 SOL).</p>}
          <Button onClick={doBuy} disabled={!wallet.publicKey || busy} className="w-full">
            {busy ? 'Confirm in your wallet…' : wallet.publicKey ? 'Buy' : 'Connect a wallet to buy'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span className="uppercase tracking-wider">You sell</span>
            <span className="num">balance {tokens(d.tokenBalance)}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => setSellPct(p)}
                className={`h-10 rounded-lg border text-sm ${sellPct === p ? 'border-teal text-fg' : 'border-line text-muted'}`}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="num text-lg">{tokens(sellAmount)} tokens</div>
          {h && !onDamm && !d.launch.finalized && (
            <p className="text-sm text-muted">
              Selling {sellPct}% costs you <span className="text-fg">{sellPct}% of your points</span> (−{compact(forfeitPreview(h, sellAmount, now))}).
            </p>
          )}
          {lockLeft > 0 && !onDamm && (
            <p className="rounded-lg border border-amber/40 bg-amber-soft p-2 text-sm text-amber">
              Snipe-locked for {clock(lockLeft)} (until {timeOfDay(h!.unlockTs.toNumber())}). Sells and transfers are rejected until then.
            </p>
          )}
          <Button onClick={doSell} disabled={!wallet.publicKey || busy || sellAmount === 0n} kind={lockLeft > 0 ? 'warn' : 'primary'} className="w-full">
            {busy ? 'Confirm in your wallet…' : lockLeft > 0 ? 'Try to sell anyway' : 'Sell'}
          </Button>
        </div>
      )}
      {wallet.publicKey && <p className="num mt-3 text-right text-xs text-faint">wallet {sol(d.solBalance, 3)} SOL</p>}
    </Section>
  )
}
