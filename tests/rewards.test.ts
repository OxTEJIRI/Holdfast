/**
 * DESIGN.md §5.6 tests 9–11 (graduation + rewards) against the real DBC, DAMM v2 and DFS programs
 * (mainnet binaries), plus the keeper fallback mode used on devnet (docs/VERIFICATION.md V6).
 */
import { assert } from 'chai'
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token'
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  MigrationFeeOption,
  deriveDammV2PoolAddress,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { deriveTokenVaultAddress } from '@meteora-ag/dynamic-fee-sharing-sdk'
import BN from 'bn.js'
import {
  DFS_SHARES, TestLaunch, ata, bn, buy, claimIxs, clockNow, conn, createLaunch, dbc, depositRewardsIxs, dfs, expectError,
  fetchHolder, fetchLaunch, finalizeIx, mulShr64, newActor, rewardPerPoint, rewardsAuthorityPda, rewardsVaultPda, send, syncRewardsIx,
  tokenBalance, waitUntil, wallet, wsolAta,
} from './helpers'

const cpAmm = new CpAmm(conn)
const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]
const accrue = (points: bigint, balance: bigint, from: number, to: number) => points + balance * BigInt(Math.max(0, to - from))

/** Final points of a holder record (what claim() computes lazily). */
async function finalPoints(l: TestLaunch, owner: PublicKey): Promise<bigint> {
  const [h, launch] = await Promise.all([fetchHolder(l.mint, owner), fetchLaunch(l.mint)])
  return accrue(bn(h!.points), bn(h!.trackedBalance), h!.lastTs.toNumber(), launch.finalTs.toNumber())
}

/**
 * Claims for every owner and checks, per holder:
 *  - payout = floor(final_points × acc / 2^64) − floor(final_points × acc_before / 2^64) (program semantics);
 *  - cumulatively, claimed ≤ exact pro rata of everything ever added, short by < 1 lamport per sync round.
 * Returns the total paid in this round.
 */
async function claimAllAndCheck(l: TestLaunch, owners: Keypair[], accBefore: bigint, rounds: number) {
  const launch = await fetchLaunch(l.mint)
  const acc = bn(launch.accRewardPerPoint)
  const ftp = bn(launch.finalTotalPoints)
  const totalIn = bn(launch.totalRewardsIn)
  let paid = 0n
  for (const o of owners) {
    const fp = await finalPoints(l, o.publicKey)
    const before = await tokenBalance(wsolAta(o.publicKey))
    const expected = mulShr64(fp, acc) - mulShr64(fp, accBefore)
    if (expected === 0n) {
      await expectError(async () => send(await claimIxs(l, o.publicKey), [o]), 'NothingToClaim')
      continue
    }
    await send(await claimIxs(l, o.publicKey), [o])
    const got = (await tokenBalance(wsolAta(o.publicKey))) - before
    assert.equal(got, expected, 'claim = floor(final_points × acc / 2^64) − debt')
    const claimed = bn((await fetchHolder(l.mint, o.publicKey))!.claimed)
    const exactCumulative = (totalIn * fp) / ftp
    assert.isTrue(claimed <= exactCumulative, `never above pro rata (exact ${exactCumulative}, claimed ${claimed})`)
    assert.isTrue(exactCumulative - claimed <= BigInt(rounds), `within ${rounds} lamport(s) of pro rata (exact ${exactCumulative}, claimed ${claimed})`)
    paid += got
  }
  const after = await fetchLaunch(l.mint)
  assert.isTrue(bn(after.totalRewardsClaimed) <= bn(after.totalRewardsIn), 'claims never exceed what was added')
  return paid
}

describe('rewards (DFS mode)', function () {
  this.timeout(600_000)

  let l: TestLaunch
  let a: Keypair, b: Keypair, closer: Keypair, trader: Keypair
  let dammPool: PublicKey
  let claimedRound1 = 0n

  before(async () => {
    ;[a, b, closer, trader] = await Promise.all([newActor(), newActor(), newActor(10), newActor(10)])
    l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0, thresholdSol: 0.5, mode: 'dfs' })
    await buy(l, a, 0.05, { register: true })
    await waitUntil((await clockNow()) + 2)
    await buy(l, b, 0.03, { register: true })
    await waitUntil((await clockNow()) + 2)
  })

  it('launch is bound to the DFS vault (fee claimer)', async () => {
    const launch = await fetchLaunch(l.mint)
    assert.isTrue(launch.feeVault.equals(l.feeVault))
    const vault = await dfs.getFeeVault(l.feeVault)
    assert.isTrue(vault.users[0].address.equals(rewardsAuthorityPda(l.mint)), 'shareholder #0 is the rewards PDA')
    assert.equal(vault.users[0].share, DFS_SHARES.holders)
  })

  it('sync_rewards before finalize is a no-op', async () => {
    await send([await syncRewardsIx(l)], [wallet])
    const launch = await fetchLaunch(l.mint)
    assert.equal(bn(launch.accRewardPerPoint), 0n)
    assert.equal(await tokenBalance(rewardsVaultPda(l.mint)), 0n)
  })

  it('9. curve completes → finalize → migrateToDammV2 into a Compounding pool', async () => {
    await buy(l, closer, 1, { partialFill: true })
    await send([await finalizeIx(l)], [wallet])
    const mig = await dbc.migration.migrateToDammV2({ payer: wallet.publicKey, pool: l.pool, dammConfig })
    await send(mig.transaction, [wallet, mig.firstPositionNftKeypair, mig.secondPositionNftKeypair])
    dammPool = deriveDammV2PoolAddress(dammConfig, l.mint, NATIVE_MINT)
    const state = await cpAmm.fetchPoolState(dammPool)
    assert.equal(state.collectFeeMode, 2, 'Compounding')
    const vaultPositions = await cpAmm.getPositionsByUser(l.feeVault)
    assert.lengthOf(vaultPositions, 1, 'partner LP position owned by the DFS vault')
    assert.isTrue(vaultPositions[0].positionState.permanentLockedLiquidity.gtn(0), 'permanently locked')
  })

  it('10. DBC partner fee → DFS → sync_rewards → holders claim pro rata (dust stays in the vault)', async () => {
    const dfsBefore = await tokenBalance(deriveTokenVaultAddress(l.feeVault))
    await send(await dfs.fundByClaimDbcPartnerTradingFee2({
      signer: l.creator.publicKey, feeClaimer: l.feeVault, feeVault: l.feeVault, poolConfig: l.config, virtualPool: l.pool,
    }), [l.creator])
    const funded = (await tokenBalance(deriveTokenVaultAddress(l.feeVault))) - dfsBefore
    assert.isTrue(funded > 0n, 'DBC partner fees reached DFS')

    await send([await syncRewardsIx(l)], [wallet])
    const launch = await fetchLaunch(l.mint)
    const added = await tokenBalance(rewardsVaultPda(l.mint))
    const holdersShare = (funded * BigInt(DFS_SHARES.holders)) / 100n
    assert.isTrue(holdersShare - added <= 1n && added <= holdersShare, `rewards PDA got its 60% (${added} of ${funded})`)
    assert.equal(bn(launch.totalRewardsIn), added)
    assert.equal(bn(launch.accRewardPerPoint), rewardPerPoint(added, bn(launch.finalTotalPoints)))

    claimedRound1 = await claimAllAndCheck(l, [a, b, l.creator], 0n, 1)
    assert.isTrue(claimedRound1 > 0n)
    const dust = await tokenBalance(rewardsVaultPda(l.mint))
    assert.equal(dust, added - claimedRound1, 'only rounding dust remains')
    assert.isTrue(dust <= 2n)

    // can't claim twice
    await expectError(async () => send(await claimIxs(l, a.publicKey), [a]), 'NothingToClaim')
  })

  it("rejects claiming someone else's record", async () => {
    const thief = await newActor(1)
    const ixs = await claimIxs(l, thief.publicKey)
    // point the claim at A's holder record
    const claimIx = ixs[1]
    const holderIdx = claimIx.keys.findIndex((k) => k.pubkey.equals(PublicKey.findProgramAddressSync([Buffer.from('holder'), ata(l.mint, thief.publicKey).toBuffer()], claimIx.programId)[0]))
    claimIx.keys[holderIdx].pubkey = PublicKey.findProgramAddressSync([Buffer.from('holder'), ata(l.mint, a.publicKey).toBuffer()], claimIx.programId)[0]
    try {
      await send(ixs, [thief])
      assert.fail('claim by a non-owner succeeded')
    } catch (e) {
      assert.match(String((e as Error).message) + JSON.stringify((e as { transactionLogs?: string[] }).transactionLogs ?? []), /ConstraintHasOne|has one/i)
    }
  })

  it('11. DAMM v2 LP fees → DFS → second sync_rewards → holders claim again', async () => {
    const state = await cpAmm.fetchPoolState(dammPool)
    // generate LP fees: SOL→base then base→SOL (the hook is revoked; plain Token-2022 transfers)
    await send(await cpAmm.swap({
      payer: trader.publicKey, pool: dammPool, inputTokenMint: NATIVE_MINT, outputTokenMint: l.mint,
      amountIn: new BN(0.5 * LAMPORTS_PER_SOL), minimumAmountOut: new BN(0),
      tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
      tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
    }), [trader])
    const baseBal = (await getAccount(conn, ata(l.mint, trader.publicKey), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount
    await send(await cpAmm.swap({
      payer: trader.publicKey, pool: dammPool, inputTokenMint: l.mint, outputTokenMint: NATIVE_MINT,
      amountIn: new BN(baseBal.toString()), minimumAmountOut: new BN(0),
      tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
      tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
    }), [trader])

    const [position] = await cpAmm.getPositionsByUser(l.feeVault)
    const dfsBefore = await tokenBalance(deriveTokenVaultAddress(l.feeVault))
    await send(await dfs.fundByClaimDammV2Fee({
      signer: l.creator.publicKey, owner: l.feeVault, feeVault: l.feeVault,
      dammV2Position: position.position, dammV2PositionNftAccount: position.positionNftAccount, dammV2Pool: dammPool,
    }), [l.creator])
    const funded = (await tokenBalance(deriveTokenVaultAddress(l.feeVault))) - dfsBefore
    assert.isTrue(funded > 0n, 'DAMM v2 LP fees reached DFS')

    const pre = await fetchLaunch(l.mint)
    const vaultBefore = await tokenBalance(rewardsVaultPda(l.mint))
    await send([await syncRewardsIx(l)], [wallet])
    const added = (await tokenBalance(rewardsVaultPda(l.mint))) - vaultBefore
    assert.isTrue(added > 0n)
    const paid = await claimAllAndCheck(l, [a, b], bn(pre.accRewardPerPoint), 2)
    assert.isTrue(paid > 0n, 'holders were paid again after graduation')

    const launch = await fetchLaunch(l.mint)
    assert.equal(bn(launch.totalRewardsClaimed), claimedRound1 + paid)
    assert.isTrue(bn(launch.totalRewardsClaimed) <= bn(launch.totalRewardsIn))
  })

  it('deposit_rewards is rejected in DFS mode', async () => {
    await expectError(async () => send(await depositRewardsIxs(l, wallet.publicKey, 1000n), [wallet]), 'WrongFeeMode')
  })
})

describe('rewards (keeper mode — devnet fallback)', function () {
  this.timeout(600_000)

  let l: TestLaunch
  let a: Keypair, b: Keypair, closer: Keypair

  before(async () => {
    ;[a, b, closer] = await Promise.all([newActor(), newActor(), newActor(10)])
    l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0, thresholdSol: 0.5, mode: 'keeper' })
    await buy(l, a, 0.04, { register: true })
    await waitUntil((await clockNow()) + 2)
    await buy(l, b, 0.04, { register: true })
  })

  it('a deposit before finalize waits; the keeper flow pays holders after finalize', async () => {
    // the keeper deposits early: it sits in the vault, undistributed
    await send(await depositRewardsIxs(l, wallet.publicKey, 1_000_000n), [wallet])
    assert.equal(bn((await fetchLaunch(l.mint)).accRewardPerPoint), 0n)

    await buy(l, closer, 1, { partialFill: true })
    await send([await finalizeIx(l)], [wallet])

    // keeper claims the DBC partner fee (it is the fee claimer) and deposits the holders' 60%
    const before = await conn.getBalance(wallet.publicKey)
    const claimSig = (await send(await dbc.partner.claimPartnerTradingFee2({
      pool: l.pool, feeClaimer: wallet.publicKey, payer: wallet.publicKey, maxBaseAmount: new BN(0),
      maxQuoteAmount: new BN('18446744073709551615'), receiver: wallet.publicKey,
    }), [wallet])).sig
    const fee = (await conn.getTransaction(claimSig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))!.meta!.fee
    const partnerFee = BigInt((await conn.getBalance(wallet.publicKey)) - before + fee)
    assert.isTrue(partnerFee > 0n)
    const holdersShare = (partnerFee * BigInt(DFS_SHARES.holders)) / 100n
    await send(await depositRewardsIxs(l, wallet.publicKey, holdersShare), [wallet])

    const launch = await fetchLaunch(l.mint)
    const added = 1_000_000n + holdersShare
    assert.equal(bn(launch.totalRewardsIn), added, 'the early deposit is picked up too')
    const paid = await claimAllAndCheck(l, [a, b, l.creator], 0n, 1)
    assert.isTrue(paid > 0n)
  })

  it('sync_rewards is rejected in keeper mode', async () => {
    await expectError(async () => send([await syncRewardsIx(l)], [wallet]), 'WrongFeeMode')
  })
})
