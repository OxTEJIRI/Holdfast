'use client'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { Keypair, Transaction } from '@solana/web3.js'
import { claim, claimable, crank, explainError, finalize, graduatedPoolAddress, migrate, presets, projectedShare } from '@holdfast/sdk'
import { useState } from 'react'
import { celebrate } from '@/components/Celebrate'
import { useToast } from '@/components/Toast'
import { Button, Section, Stat } from '@/components/ui'
import { explorer } from '@/lib/config'
import { pct, sol } from '@/lib/format'
import { sendWithWallet } from '@/lib/send'
import type { LaunchData } from '@/lib/useLaunch'

export function RewardsPanel({ d, now, onDone }: { d: LaunchData; now: number; onDone: () => void }) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const toast = useToast()
  const [busy, setBusy] = useState<string>()
  const l = d.launch
  const me = wallet.publicKey
  const owed = d.holder ? claimable(d.holder, l) : 0n
  // who can route fees: the keeper (keeper mode) or the creator, a DFS shareholder (DFS mode)
  const canCrank = !!me && (l.feeMode === 'keeper' ? d.feeClaimer.equals(me) : l.creator.equals(me))

  async function run(key: string, label: string, steps: () => Promise<{ tx: Transaction; signers?: Keypair[] }[]>, party?: { text: string; sub: string }) {
    setBusy(key)
    try {
      let last = ''
      const list = await steps()
      if (list.length === 0) toast({ kind: 'info', text: 'Nothing to do right now.' })
      for (const s of list) last = await sendWithWallet(connection, wallet, s.tx, s.signers)
      if (list.length) {
        toast({ kind: 'ok', text: label, sig: last })
        if (party) celebrate(party)
      }
      onDone()
    } catch (e) {
      toast({ kind: 'error', text: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Section title="Rewards" aside={<span className="text-xs text-muted">{l.feeMode === 'dfs' ? 'Meteora Dynamic Fee Sharing' : 'keeper mode (devnet)'}</span>}>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Claimable" value={`${sol(owed, 6)} SOL`} accent={owed > 0n} />
        <Stat label="You've earned" value={`${sol(d.holder ? BigInt(d.holder.claimed.toString()) : 0n, 6)} SOL`} sub="lifetime" />
        <Stat label="Paid to holders" value={`${sol(BigInt(l.totalRewardsIn.toString()), 4)} SOL`} sub="all time" />
        <Stat
          label={l.finalized ? 'Your final share' : 'Share if graduated now'}
          value={d.holder ? pct(projectedShare(d.holder, l, now)) : '—'}
        />
      </div>

      {!l.finalized && (
        <p className="mt-4 text-sm text-muted">
          Rewards open when the curve completes. Then {d.meta.holdersPct ?? presets.fairLaunch.split.holders}% of every fee (bonding curve now, DAMM v2 LP fees forever
          after) is paid out by final conviction.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {l.finalized && (
          <Button
            onClick={() => run('claim', `Claimed ${sol(owed, 6)} SOL`, async () => [{ tx: await claim(connection, { owner: me!, mint: l.mint }) }], { text: `+${sol(owed, 6)} SOL`, sub: 'paid for staying' })}
            disabled={!me || owed === 0n || !!busy}
          >
            {busy === 'claim' ? 'Claiming…' : owed > 0n ? `Claim ${sol(owed, 6)} SOL` : 'Nothing to claim'}
          </Button>
        )}
        {d.curveComplete && !l.finalized && (
          <Button kind="ghost" disabled={!me || !!busy} onClick={() => run('finalize', 'Finalized: conviction frozen', async () => [{ tx: await finalize(connection, l.mint, me!) }], { text: 'Conviction frozen', sub: 'rewards are open' })}>
            {busy === 'finalize' ? 'Finalizing…' : 'Finalize'}
          </Button>
        )}
        {l.finalized && !d.migrated && (
          <Button
            kind="ghost"
            disabled={!me || !!busy}
            onClick={() => run('migrate', 'Migrated to DAMM v2', async () => [await migrate(connection, { mint: l.mint, payer: me! })], { text: 'Graduated', sub: 'trading on DAMM v2' })}
          >
            {busy === 'migrate' ? 'Migrating…' : 'Migrate to DAMM v2'}
          </Button>
        )}
        {canCrank && (
          <Button
            kind="ghost"
            disabled={!!busy}
            onClick={() =>
              run('crank', 'Fees routed to holders', async () =>
                (await crank(connection, { mint: l.mint, signer: me!, holdersPct: d.meta.holdersPct ?? presets.fairLaunch.split.holders })).map((tx) => ({ tx })),
              )
            }
          >
            {busy === 'crank' ? 'Routing fees…' : 'Route fees to holders'}
          </Button>
        )}
      </div>
      {canCrank && (
        <p className="mt-2 text-xs text-faint">
          {l.feeMode === 'keeper'
            ? 'You are this launch’s fee keeper: this claims the bonding-curve and LP fees and deposits the holders’ share.'
            : 'As a fee-vault shareholder you can pull fees from Meteora into the vault and distribute them.'}
        </p>
      )}
      {d.migrated && (
        <a className="mt-4 inline-block text-sm text-teal underline" href={explorer('address', graduatedPoolAddress(l.mint).toBase58())} target="_blank" rel="noreferrer">
          DAMM v2 pool on Explorer
        </a>
      )}
    </Section>
  )
}
