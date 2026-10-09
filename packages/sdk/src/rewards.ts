/** Graduation + rewards: finalize, crank (route fees to holders), claim. */
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction } from '@solana/spl-token'
import { DynamicBondingCurveClient, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DynamicFeeSharingClient } from '@meteora-ag/dynamic-fee-sharing-sdk'
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { DAMM_V2_CONFIG } from './constants'
import { claimIx, depositRewardsIxs, finalizeIx, syncRewardsIx, wsolAta } from './instructions'
import { getLaunch } from './state'

const big = (x: BN | number | bigint) => BigInt(x.toString())
const U64_MAX = new BN('18446744073709551615')

async function requireLaunch(conn: Connection, mint: PublicKey) {
  const launch = await getLaunch(conn, mint)
  if (!launch) throw new Error(`No Holdfast launch for mint ${mint.toBase58()}`)
  return launch
}

/** Permissionless: freeze conviction once the curve has completed. */
export async function finalize(conn: Connection, mint: PublicKey, payer: PublicKey): Promise<Transaction> {
  const launch = await requireLaunch(conn, mint)
  const tx = new Transaction().add(await finalizeIx(conn, mint, launch.dbcPool))
  tx.feePayer = payer
  return tx
}

export type CrankParams = {
  mint: PublicKey
  /** DFS mode: a DFS shareholder (creator or treasury). Keeper mode: the keeper (DBC fee claimer). */
  signer: PublicKey
  /** keeper mode: holders' % of claimed fees to deposit (the launch's split; default 60) */
  holdersPct?: number
}

/**
 * Moves every claimable fee towards holders. Returns the transactions to send in order (possibly none):
 *  1. finalize, once the curve has completed;
 *  2. DFS mode: DFS `fund_by_claiming_fee` from DBC (bonding fees) and, after migration, DAMM v2 (LP fees);
 *     keeper mode: the keeper claims those fees itself and deposits the holders' share;
 *  3. DFS mode: `sync_rewards` (pull the rewards PDA's share from DFS and distribute).
 */
export async function crank(conn: Connection, p: CrankParams): Promise<Transaction[]> {
  const launch = await requireLaunch(conn, p.mint)
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const pool = (await dbc.state.getPool(launch.dbcPool))!
  const curveComplete = pool.poolState.finishCurveTimestamp.gtn(0)
  const txs: Transaction[] = []
  const add = (tx: Transaction) => {
    tx.feePayer = p.signer
    txs.push(tx)
  }

  let finalized = launch.finalized
  if (!finalized && curveComplete) {
    add(new Transaction().add(await finalizeIx(conn, p.mint, launch.dbcPool)))
    finalized = true
  }

  const partnerFee = big(pool.poolState.partnerQuoteFee)
  const dammPool = deriveDammV2PoolAddress(DAMM_V2_CONFIG, p.mint, NATIVE_MINT)
  const cpAmm = new CpAmm(conn)
  const lpOwner = launch.feeMode === 'dfs' ? launch.feeVault : p.signer
  const lpPositions = pool.poolState.isMigrated === 1
    ? (await cpAmm.getPositionsByUser(lpOwner)).filter((x) => x.positionState.pool.equals(dammPool))
    : []
  const dammState = lpPositions.length ? await cpAmm.fetchPoolState(dammPool) : null
  const lpFee = (pos: (typeof lpPositions)[number]) => big(getUnClaimLpFee(dammState!, pos.positionState).feeTokenB)

  if (launch.feeMode === 'dfs') {
    const dfs = new DynamicFeeSharingClient(conn, 'confirmed')
    if (partnerFee > 0n) {
      add(await dfs.fundByClaimDbcPartnerTradingFee2({
        signer: p.signer, feeClaimer: launch.feeVault, feeVault: launch.feeVault, poolConfig: pool.poolState.config, virtualPool: launch.dbcPool,
      }))
    }
    for (const pos of lpPositions) {
      if (lpFee(pos) === 0n) continue
      add(await dfs.fundByClaimDammV2Fee({
        signer: p.signer, owner: launch.feeVault, feeVault: launch.feeVault,
        dammV2Position: pos.position, dammV2PositionNftAccount: pos.positionNftAccount, dammV2Pool: dammPool,
      }))
    }
    if (finalized) add(new Transaction().add(await syncRewardsIx(conn, p.mint, launch.feeVault)))
    return txs
  }

  // keeper mode
  const pct = BigInt(p.holdersPct ?? 60)
  if (partnerFee > 0n) {
    add(await dbc.partner.claimPartnerTradingFee2({
      pool: launch.dbcPool, feeClaimer: p.signer, payer: p.signer, maxBaseAmount: new BN(0), maxQuoteAmount: U64_MAX, receiver: p.signer,
    }))
    add(new Transaction().add(...(await depositRewardsIxs(conn, p.mint, p.signer, (partnerFee * pct) / 100n))))
  }
  for (const pos of lpPositions) {
    const fee = lpFee(pos)
    if (fee === 0n) continue
    add(await cpAmm.claimPositionFee2({
      owner: p.signer, position: pos.position, pool: dammPool, positionNftAccount: pos.positionNftAccount,
      tokenAMint: dammState!.tokenAMint, tokenBMint: dammState!.tokenBMint, tokenAVault: dammState!.tokenAVault, tokenBVault: dammState!.tokenBVault,
      tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, receiver: p.signer,
    }))
    add(new Transaction().add(...(await depositRewardsIxs(conn, p.mint, p.signer, (fee * pct) / 100n))))
  }
  return txs
}

/** Claim a holder's rewards; by default unwraps the wSOL to SOL in the same transaction. */
export async function claim(conn: Connection, p: { owner: PublicKey; mint: PublicKey; unwrap?: boolean }): Promise<Transaction> {
  const dest = wsolAta(p.owner)
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(p.owner, dest, p.owner, NATIVE_MINT, TOKEN_PROGRAM_ID),
    await claimIx(conn, p.mint, p.owner, dest),
  )
  if (p.unwrap !== false) tx.add(createCloseAccountInstruction(dest, p.owner, p.owner, [], TOKEN_PROGRAM_ID))
  tx.feePayer = p.owner
  return tx
}
