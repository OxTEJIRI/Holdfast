/**
 * @holdfast/sdk against the real programs: every preset launches on the real DBC program, and the
 * high-level flows (buy with auto-register, crank in both fee modes, leaderboard, claim with
 * unwrap, explainError) work end to end.
 */
import { assert } from 'chai'
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as sdk from '@holdfast/sdk'
import { conn, expectError, newActor, send, waitUntil, wallet, clockNow } from './helpers'

const sendAll = async (txs: import('@solana/web3.js').Transaction[], signers: Keypair[]) => {
  for (const tx of txs) await send(tx, sdk.requiredSigners(tx, signers))
}

async function launch(preset: sdk.PresetId, network: sdk.Network, feeMode: sdk.FeeMode, overrides?: sdk.PresetOverrides) {
  const creator = await newActor(2)
  const treasury = Keypair.generate().publicKey
  const prepared = await sdk.createLaunch(conn, {
    creator: creator.publicKey, payer: wallet.publicKey, name: `SDK ${preset}`, symbol: 'SDK', uri: 'https://holdfast.example/s.json',
    preset, network, treasury, feeMode, keeper: wallet.publicKey, overrides,
  })
  const sizes: number[] = []
  for (const step of prepared.steps) {
    const tx = await step.build()
    // exactly what the SDK builds: no extra compute-budget instruction
    await send(tx, sdk.requiredSigners(tx, [wallet, creator, ...step.signers]), { computeBudget: false })
    sizes.push(tx.serialize().length)
  }
  return { prepared, creator, treasury, sizes }
}

describe('@holdfast/sdk', function () {
  this.timeout(600_000)

  describe('presets launch on the real DBC program', () => {
    for (const preset of ['fairLaunch', 'slowBurn', 'arena'] as const) {
      for (const network of ['devnet', 'mainnet'] as const) {
        it(`${preset} (${network} threshold, ${sdk.defaultFeeMode(network)} mode)`, async () => {
          const { prepared, sizes } = await launch(preset, network, sdk.defaultFeeMode(network))
          console.log(`        tx sizes: ${sizes.join(' / ')} of ${sdk.MAX_TX_BYTES} bytes`)
          for (const n of sizes) assert.isAtMost(n, sdk.MAX_TX_BYTES)
          const l = (await sdk.getLaunch(conn, prepared.mint))!
          const rules = sdk.presets[preset].rules
          assert.equal(l.windowSecs, rules.windowSecs)
          assert.equal(l.snipeLockSecs, rules.snipeLockSecs)
          assert.equal(l.maxWalletBps, rules.maxWalletBps)
          assert.equal(l.feeMode, sdk.defaultFeeMode(network))
          assert.equal(l.protectionEndsAt - l.launchTs.toNumber(), rules.windowSecs + rules.snipeLockSecs)
          assert.isAtMost(rules.windowSecs + rules.snipeLockSecs, 40 * 60, 'honeypot bound: ≤ 40 minutes')
        })
      }
    }
  })

  for (const feeMode of ['dfs', 'keeper'] as const) {
    describe(`buy → graduate → crank → claim (${feeMode} mode)`, () => {
      let mint: import('@solana/web3.js').PublicKey
      let creator: Keypair
      let alice: Keypair, bob: Keypair, closer: Keypair

      before(async () => {
        ;[alice, bob, closer] = await Promise.all([newActor(), newActor(), newActor(10)])
        const r = await launch('arena', 'localnet', feeMode, {
          rules: { windowSecs: 15, snipeLockSecs: 15, maxWalletBps: 300 }, thresholdSol: 0.5, fee: { startBps: 100, endBps: 100 },
        })
        mint = r.prepared.mint
        creator = r.creator
      })

      it('buy auto-registers; explainError explains a real snipe-lock', async () => {
        await send(await sdk.buy(conn, { owner: alice.publicKey, mint, solIn: 0.01, tokensOut: sdk.TOTAL_SUPPLY / 100n }), [alice])
        await send(await sdk.buy(conn, { owner: bob.publicKey, mint, solIn: 0.01, tokensOut: sdk.TOTAL_SUPPLY / 200n }), [bob])
        const h = (await sdk.getHolderForOwner(conn, mint, alice.publicKey))!
        assert.isNotNull(h, 'registered by buy()')
        assert.isAbove(h.unlockTs.toNumber(), 0)

        try {
          await send(await sdk.sell(conn, { owner: alice.publicKey, mint, tokensIn: 1_000_000n }), [alice])
          assert.fail('sell inside the lock succeeded')
        } catch (e) {
          assert.equal(sdk.holdfastErrorName(e), 'SnipeLocked')
          assert.match(sdk.explainError(e), /^Snipe-locked until \d\d:\d\d:\d\d$/)
        }
      })

      it('leaderboard and projected share track conviction live', async () => {
        const l = (await sdk.getLaunch(conn, mint))!
        await waitUntil(l.protectionEndsAt)
        const now = await clockNow()
        const board = await sdk.getLeaderboard(conn, mint, 10, now)
        assert.equal(board[0].owner.toBase58(), alice.publicKey.toBase58(), 'alice: 2× bob\'s balance, and earlier → first')
        assert.equal(board[1].owner.toBase58(), bob.publicKey.toBase58())
        assert.closeTo(board.reduce((s, r) => s + r.share, 0), 1, 1e-6, 'shares sum to 1 (creator holds 0)')
        const launchNow = (await sdk.getLaunch(conn, mint))!
        for (const [row, who] of [[board[0], alice], [board[1], bob]] as const) {
          const h = (await sdk.getHolderForOwner(conn, mint, who.publicKey))!
          assert.equal(row.points, sdk.pointsAt(h, now), 'leaderboard points = lazy accrual to now')
          assert.closeTo(sdk.projectedShare(h, launchNow, now), row.share, 1e-6)
        }
        // exactly 2:1 if both buys landed in the same second, more if alice held longer
        assert.isTrue(board[0].points >= 2n * board[1].points, 'alice ≥ 2× bob')
      })

      it('crank finalizes and routes fees; claim pays out in SOL (unwrapped)', async () => {
        await send(await sdk.buy(conn, { owner: closer.publicKey, mint, solIn: 1, partialFill: true }), [closer])
        const signer = feeMode === 'dfs' ? creator : wallet
        const txs = await sdk.crank(conn, { mint, signer: signer.publicKey })
        assert.isAtLeast(txs.length, feeMode === 'dfs' ? 3 : 3, 'finalize + fee route + distribute')
        await sendAll(txs, [signer])

        const l = (await sdk.getLaunch(conn, mint))!
        assert.isTrue(l.finalized)
        assert.isTrue(BigInt(l.totalRewardsIn.toString()) > 0n, 'holders received fees')

        for (const who of [alice, bob]) {
          const h = (await sdk.getHolderForOwner(conn, mint, who.publicKey))!
          const owed = sdk.claimable(h, l)
          assert.isTrue(owed > 0n)
          const before = await conn.getBalance(who.publicKey)
          const { sig } = await send(await sdk.claim(conn, { owner: who.publicKey, mint }), [who])
          const fee = (await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))!.meta!.fee
          const gained = BigInt((await conn.getBalance(who.publicKey)) - before + fee)
          // unwrap closes the wSOL ATA: gain = claim + the ATA rent it created and refunded (net 0)
          assert.equal(gained, owed, `${who === alice ? 'alice' : 'bob'} received exactly claimable() in SOL`)
          const after = (await sdk.getHolderForOwner(conn, mint, who.publicKey))!
          assert.equal(sdk.claimable(after, l), 0n)
        }

        await expectError(async () => send(await sdk.claim(conn, { owner: alice.publicKey, mint }), [alice]), 'NothingToClaim')
        try {
          await send(await sdk.claim(conn, { owner: alice.publicKey, mint }), [alice])
        } catch (e) {
          assert.equal(sdk.explainError(e), 'Nothing to claim right now.')
        }

        // nothing left to route: a second crank only re-syncs (DFS) or does nothing (keeper)
        const again = await sdk.crank(conn, { mint, signer: signer.publicKey })
        assert.isAtMost(again.length, feeMode === 'dfs' ? 1 : 0)
        assert.isAbove(LAMPORTS_PER_SOL, 0)
      })
    })
  }
})
