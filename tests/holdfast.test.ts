/**
 * DESIGN.md §5.6 tests 1–8 against the real DBC program on a local validator.
 * Test 12 (overflow at max supply × max duration) is a Rust unit test: programs/holdfast/src/math.rs.
 *
 * Timing: the opening window / snipe-lock run on the validator's real clock, so the launches here
 * use windows of a few seconds (the hard caps are upper bounds only).
 */
import { assert } from 'chai'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
  getTransferHook,
} from '@solana/spl-token'
import {
  SUPPLY, TestLaunch, ata, balanceOf, bn, buy, clockNow, conn, createLaunch, dbc, expectError, fetchHolder, fetchLaunch,
  hookComputeUnits, newActor, program, registerIxs, send, sell, transfer, transferIx, waitUntil,
} from './helpers'

const HOOK_CU_BUDGET = 30_000

/** Off-chain accrual, mirroring math::accrue. */
const accrue = (points: bigint, balance: bigint, from: number, to: number) => points + balance * BigInt(Math.max(0, to - from))

/** Global totals must equal the sum of all registered records brought to the same timestamp. */
async function assertTotalsConsistent(l: TestLaunch, owners: PublicKey[]) {
  const launch = await fetchLaunch(l.mint)
  const t = launch.globalLastTs.toNumber()
  let tracked = 0n
  let points = 0n
  for (const o of owners) {
    const h = await fetchHolder(l.mint, o)
    if (!h) continue
    tracked += bn(h.trackedBalance)
    points += accrue(bn(h.points), bn(h.trackedBalance), h.lastTs.toNumber(), t)
    assert.isTrue(bn(h.trackedBalance) <= (await balanceOf(l.mint, o)), 'tracked balance never exceeds the real balance')
  }
  assert.equal(bn(launch.totalTracked), tracked, 'total_tracked = Σ tracked_balance')
  assert.equal(bn(launch.totalPoints), points, 'total_points = Σ points')
}

describe('holdfast', function () {
  this.timeout(600_000)

  describe('1. DBC hook pool + init_launch in one tx, then swap2WithTransferHook buy', () => {
    let l: TestLaunch & { createTxBytes: number }
    const buyer = Keypair.generate()

    before(async () => {
      l = await createLaunch({ windowSecs: 30, snipeLockSecs: 60, maxWalletBps: 0 })
    })

    it('creates the launch, meta list and creator record in the pool-creation tx', async () => {
      const tx = await conn.getTransaction(l.createSig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
      const programs = tx!.transaction.message.compiledInstructions.map((ix) =>
        tx!.transaction.message.staticAccountKeys[ix.programIdIndex].toBase58())
      assert.include(programs, 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
      assert.include(programs, program.programId.toBase58())
      console.log(`      create tx: ${l.createTxBytes} / 1232 bytes (pool + init_launch + creator ATA + register)`)

      const launch = await fetchLaunch(l.mint)
      assert.isTrue(launch.mint.equals(l.mint))
      assert.isTrue(launch.dbcPool.equals(l.pool))
      assert.isTrue(launch.dbcConfig.equals(l.config))
      assert.isTrue(launch.creator.equals(l.creator.publicKey))
      assert.isTrue(launch.feeVault.equals(PublicKey.default))
      assert.equal(bn(launch.totalSupply), SUPPLY)
      assert.equal(launch.windowSecs, 30)
      assert.equal(launch.snipeLockSecs, 60)
      assert.equal(launch.holderCount, 1)
      const creatorRecord = await fetchHolder(l.mint, l.creator.publicKey)
      assert.isNotNull(creatorRecord)

      const hook = getTransferHook(await getMint(conn, l.mint, 'confirmed', TOKEN_2022_PROGRAM_ID))
      assert.isTrue(hook!.programId.equals(program.programId))
    })

    it('a first-time buyer registers + buys in one tx; the hook tracks and snipe-locks it', async () => {
      await conn.requestAirdrop(buyer.publicKey, 5e9).then((s) => conn.confirmTransaction(s, 'confirmed'))
      const { logs } = await buy(l, buyer, 0.01, { register: true })
      const h = (await fetchHolder(l.mint, buyer.publicKey))!
      const balance = await balanceOf(l.mint, buyer.publicKey)
      assert.isTrue(balance > 0n)
      assert.equal(bn(h.trackedBalance), balance)
      assert.isTrue(h.owner.equals(buyer.publicKey))
      assert.equal(h.unlockTs.toNumber(), h.lastTs.toNumber() + 60, 'bought in window → locked for snipe_lock_secs')

      const cu = hookComputeUnits(logs)
      assert.lengthOf(cu, 1)
      console.log(`      hook compute units (buy): ${cu[0]}`)
      assert.isBelow(cu[0], HOOK_CU_BUDGET)
      await assertTotalsConsistent(l, [l.creator.publicKey, buyer.publicKey])
    })
  })

  describe('2–3. conviction points', () => {
    let l: TestLaunch
    let a: Keypair, b: Keypair, funder: Keypair
    const N = 10_000_000_000n // 10k tokens

    before(async () => {
      // window 0: no protection rules, isolates the accounting
      l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 })
      ;[a, b, funder] = await Promise.all([newActor(), newActor(), newActor(20)])
      await buy(l, funder, 2) // unregistered funder: untracked
      await send([...(await Promise.all([...registerIxs(l.mint, a.publicKey), ...registerIxs(l.mint, b.publicKey)]))], [a, b])
    })

    it('2. points accrue linearly; 2:1 balances give exactly 2:1 points', async () => {
      // fund both in one tx → same last_ts
      await send([
        await transferIx(l.mint, funder.publicKey, a.publicKey, 2n * N),
        await transferIx(l.mint, funder.publicKey, b.publicKey, N),
      ], [funder])
      const [a0, b0] = [(await fetchHolder(l.mint, a.publicKey))!, (await fetchHolder(l.mint, b.publicKey))!]
      assert.equal(a0.lastTs.toNumber(), b0.lastTs.toNumber())
      assert.equal(bn(a0.points), 0n)

      await waitUntil(a0.lastTs.toNumber() + 4)
      // zero-amount transfers make the hook accrue both records at the same timestamp
      const { logs } = await send([
        await transferIx(l.mint, a.publicKey, funder.publicKey, 0n),
        await transferIx(l.mint, b.publicKey, funder.publicKey, 0n),
      ], [a, b])
      const [a1, b1] = [(await fetchHolder(l.mint, a.publicKey))!, (await fetchHolder(l.mint, b.publicKey))!]
      const dt = BigInt(a1.lastTs.toNumber() - a0.lastTs.toNumber())
      assert.isTrue(dt >= 4n)
      assert.equal(bn(a1.points), 2n * N * dt, 'points = balance × seconds')
      assert.equal(bn(b1.points), N * dt)
      assert.equal(bn(a1.points), 2n * bn(b1.points), '2:1')
      for (const cu of hookComputeUnits(logs)) assert.isBelow(cu, HOOK_CU_BUDGET)
      await assertTotalsConsistent(l, [l.creator.publicKey, a.publicKey, b.publicKey])
    })

    it('3a. a partial sell forfeits points proportionally', async () => {
      await waitUntil((await clockNow()) + 2)
      const before = (await fetchHolder(l.mint, a.publicKey))!
      const tracked = bn(before.trackedBalance)
      const sold = tracked / 4n
      await sell(l, a, sold)
      const after = (await fetchHolder(l.mint, a.publicKey))!
      const accrued = accrue(bn(before.points), tracked, before.lastTs.toNumber(), after.lastTs.toNumber())
      const lost = (accrued * sold) / tracked
      assert.equal(bn(after.points), accrued - lost, 'selling 25% of the bag forfeits 25% of the points')
      assert.equal(bn(after.trackedBalance), tracked - sold)
      await assertTotalsConsistent(l, [l.creator.publicKey, a.publicKey, b.publicKey])
    })

    it('3b. a wallet-to-wallet transfer forfeits too (no score laundering)', async () => {
      const before = (await fetchHolder(l.mint, b.publicKey))!
      const tracked = bn(before.trackedBalance)
      const moved = tracked / 2n
      const fresh = Keypair.generate()
      await transfer(l.mint, b, fresh.publicKey, moved)
      const after = (await fetchHolder(l.mint, b.publicKey))!
      const accrued = accrue(bn(before.points), tracked, before.lastTs.toNumber(), after.lastTs.toNumber())
      assert.equal(bn(after.points), accrued - (accrued * moved) / tracked)
    })

    it('3c. a full sell resets the record to zero', async () => {
      await sell(l, a, await balanceOf(l.mint, a.publicKey))
      const after = (await fetchHolder(l.mint, a.publicKey))!
      assert.equal(bn(after.points), 0n)
      assert.equal(bn(after.trackedBalance), 0n)
      await assertTotalsConsistent(l, [l.creator.publicKey, a.publicKey, b.publicKey])
    })
  })

  describe('4. snipe-lock', () => {
    let l: TestLaunch
    let sniper: Keypair

    before(async () => {
      sniper = await newActor()
      l = await createLaunch({ windowSecs: 8, snipeLockSecs: 12, maxWalletBps: 0 })
    })

    it('a buy inside the window cannot be sold or moved before unlock_ts', async () => {
      await buy(l, sniper, 0.02, { register: true })
      const h = (await fetchHolder(l.mint, sniper.publicKey))!
      const launch = await fetchLaunch(l.mint)
      assert.isBelow(h.lastTs.toNumber(), launch.launchTs.toNumber() + 8, 'bought inside the window')
      assert.equal(h.unlockTs.toNumber(), h.lastTs.toNumber() + 12)

      const balance = await balanceOf(l.mint, sniper.publicKey)
      const logs = await expectError(() => sell(l, sniper, balance), 'SnipeLocked')
      assert.isTrue(logs.some((x) => x.includes(`unlocks at unix ${h.unlockTs.toNumber()}`)))
      await expectError(() => transfer(l.mint, sniper, Keypair.generate().publicKey, 1n), 'SnipeLocked')
    })

    it('the same sell succeeds once unlock_ts has passed', async () => {
      const h = (await fetchHolder(l.mint, sniper.publicKey))!
      await waitUntil(h.unlockTs.toNumber())
      await sell(l, sniper, (await balanceOf(l.mint, sniper.publicKey)) / 2n)
    })
  })

  describe('5. registered receivers during the window', () => {
    let l: TestLaunch
    let bundler: Keypair, fresh: Keypair, registered: Keypair

    before(async () => {
      ;[bundler, fresh, registered] = await Promise.all([newActor(), newActor(), newActor()])
      l = await createLaunch({ windowSecs: 8, snipeLockSecs: 0, maxWalletBps: 0 })
    })

    it('in the window, a buy into an unregistered account fails; a registered one succeeds', async () => {
      await expectError(() => buy(l, bundler, 0.01), 'RecipientNotRegistered')
      await buy(l, registered, 0.01, { register: true })
      // a wallet-to-wallet transfer to a fresh wallet is blocked too (lock is 0 here)
      await expectError(() => transfer(l.mint, registered, fresh.publicKey, 1n), 'RecipientNotRegistered')
    })

    it('after the window, unregistered accounts can receive (and stay untracked)', async () => {
      const launch = await fetchLaunch(l.mint)
      await waitUntil(launch.launchTs.toNumber() + launch.windowSecs)
      await buy(l, bundler, 0.01)
      await transfer(l.mint, registered, fresh.publicKey, 1n)
      assert.isNull(await fetchHolder(l.mint, bundler.publicKey))
      assert.isTrue((await balanceOf(l.mint, bundler.publicKey)) > 0n)
    })
  })

  describe('6. max wallet during the window', () => {
    let l: TestLaunch
    let whale: Keypair

    before(async () => {
      whale = await newActor()
      l = await createLaunch({ windowSecs: 8, snipeLockSecs: 0, maxWalletBps: 50 })
    })

    it('in the window, a buy that leaves the wallet above 0.5% of supply fails; a small one passes', async () => {
      await send(await Promise.all(registerIxs(l.mint, whale.publicKey)), [whale])
      await expectError(() => buy(l, whale, 0.1), 'MaxWalletExceeded')
      await buy(l, whale, 0.001)
      const cap = (SUPPLY * 50n) / 10_000n
      assert.isTrue((await balanceOf(l.mint, whale.publicKey)) <= cap)
    })

    it('after the window the same buy passes', async () => {
      const launch = await fetchLaunch(l.mint)
      await waitUntil(launch.launchTs.toNumber() + launch.windowSecs)
      await buy(l, whale, 0.1)
      assert.isTrue((await balanceOf(l.mint, whale.publicKey)) > (SUPPLY * 50n) / 10_000n)
    })
  })

  describe('7. after window + lock the hook rejects nothing (fuzz)', () => {
    let l: TestLaunch
    let actors: Keypair[]
    let registered: Keypair[]

    // deterministic PRNG (mulberry32) so failures are reproducible
    let seed = Number(process.env.FUZZ_SEED ?? 0x5eed)
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = seed
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

    before(async () => {
      actors = await Promise.all(Array.from({ length: 6 }, () => newActor(10)))
      registered = actors.slice(0, 4)
      l = await createLaunch({ windowSecs: 3, snipeLockSecs: 5, maxWalletBps: 50 })
      // in-window activity: registered wallets buy small (and get snipe-locked)
      for (const r of registered) await buy(l, r, 0.001, { register: true })
      const launch = await fetchLaunch(l.mint)
      await waitUntil(launch.launchTs.toNumber() + launch.windowSecs + launch.snipeLockSecs)
    })

    it('60 random buys / sells / transfers (incl. 0, full balance, unregistered targets, whale sizes) all succeed', async () => {
      const ops: string[] = []
      for (let i = 0; i < 60; i++) {
        const actor = pick(actors)
        const bal = await balanceOf(l.mint, actor.publicKey)
        const r = rand()
        const fraction = (x: bigint) => pick([0n, 1n, x / 3n, x / 2n, x]) // includes 0 and everything
        try {
          if (r < 0.35 || bal === 0n) {
            const sol = pick([0.0005, 0.005, 0.05, 0.3])
            ops.push(`buy ${sol}`)
            await buy(l, actor, sol)
          } else if (r < 0.65) {
            const amount = fraction(bal)
            ops.push(`sell ${amount}`)
            if (amount > 0n) await sell(l, actor, amount)
          } else {
            const to = rand() < 0.2 ? Keypair.generate().publicKey : pick(actors).publicKey
            const amount = fraction(bal)
            ops.push(`transfer ${amount}`)
            await transfer(l.mint, actor, to, amount)
          }
        } catch (e) {
          throw new Error(`op #${i} (${ops[ops.length - 1]}) failed after window+lock (seed ${process.env.FUZZ_SEED ?? '0x5eed'}): ${(e as Error).message}`)
        }
      }
      await assertTotalsConsistent(l, [l.creator.publicKey, ...actors.map((a) => a.publicKey)])
    })
  })

  describe('8. curve completes → hook revoked → finalize → plain transfers', () => {
    let l: TestLaunch
    let holder: Keypair, closer: Keypair

    before(async () => {
      ;[holder, closer] = await Promise.all([newActor(), newActor(10)])
      l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0, thresholdSol: 0.5 })
      await buy(l, holder, 0.05, { register: true })
    })

    it('finalize is rejected while the curve is live', async () => {
      await expectError(
        () => program.methods.finalize().accountsPartial({ launch: l.launch, mint: l.mint, dbcPool: l.pool }).rpc(),
        'CurveNotComplete',
      )
    })

    it('the completing buy revokes the hook; finalize freezes conviction at finishCurveTimestamp', async () => {
      await waitUntil((await clockNow()) + 2)
      await buy(l, closer, 1, { partialFill: true })
      const hook = getTransferHook(await getMint(conn, l.mint, 'confirmed', TOKEN_2022_PROGRAM_ID))
      assert.isTrue(!hook || hook.programId.equals(PublicKey.default), 'hook program revoked')

      const pre = await fetchLaunch(l.mint)
      const finishTs = (await dbc.state.getPool(l.pool))!.poolState.finishCurveTimestamp.toNumber()
      assert.isAbove(finishTs, 0)
      await program.methods.finalize().accountsPartial({ launch: l.launch, mint: l.mint, dbcPool: l.pool }).rpc()
      const post = await fetchLaunch(l.mint)
      assert.isTrue(post.finalized)
      assert.equal(post.finalTs.toNumber(), finishTs)
      assert.equal(
        bn(post.finalTotalPoints),
        accrue(bn(pre.totalPoints), bn(pre.totalTracked), pre.globalLastTs.toNumber(), finishTs),
      )
      assert.isTrue(bn(post.finalTotalPoints) > 0n)

      await expectError(
        () => program.methods.finalize().accountsPartial({ launch: l.launch, mint: l.mint, dbcPool: l.pool }).rpc(),
        'AlreadyFinalized',
      )
    })

    it('plain transferChecked (no hook accounts) works; registration is closed', async () => {
      const other = Keypair.generate().publicKey
      await send([
        createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, ata(l.mint, other), other, l.mint, TOKEN_2022_PROGRAM_ID),
        createTransferCheckedInstruction(ata(l.mint, holder.publicKey), l.mint, ata(l.mint, other), holder.publicKey, 1_000_000n, 6, [], TOKEN_2022_PROGRAM_ID),
      ], [holder])
      assert.equal(await balanceOf(l.mint, other), 1_000_000n)
      const late = await newActor(1)
      await send([createAssociatedTokenAccountIdempotentInstruction(late.publicKey, ata(l.mint, late.publicKey), late.publicKey, l.mint, TOKEN_2022_PROGRAM_ID)], [late])
      const [, registerLate] = await Promise.all(registerIxs(l.mint, late.publicKey))
      await expectError(() => send([registerLate], [late]), 'TradingClosed')
    })
  })

  describe('init_launch guards', () => {
    it('rejects params above the hard caps', async () => {
      await expectError(() => createLaunch({ windowSecs: 601, snipeLockSecs: 0, maxWalletBps: 0 }), 'ParamOutOfBounds')
      await expectError(() => createLaunch({ windowSecs: 0, snipeLockSecs: 1801, maxWalletBps: 0 }), 'ParamOutOfBounds')
      await expectError(() => createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 49 }), 'ParamOutOfBounds')
    })

    it('rejects an init_launch signed by someone other than the pool creator', async () => {
      const impostor = await newActor(1)
      await expectError(
        () => createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 }, { initLaunchCreator: impostor }),
        'InvalidDbcAccount',
      )
    })
  })
})
