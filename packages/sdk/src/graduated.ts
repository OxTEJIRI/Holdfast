/** After graduation: migrate the DBC pool into DAMM v2, and trade on the graduated pool. */
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { DynamicBondingCurveClient, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { DAMM_V2_CONFIG, TOKEN_DECIMALS } from './constants'
import { getLaunch } from './state'

/** The DAMM v2 pool a Holdfast launch graduates into. */
export const graduatedPoolAddress = (mint: PublicKey) => deriveDammV2PoolAddress(DAMM_V2_CONFIG, mint, NATIVE_MINT)

/** Permissionless DBC → DAMM v2 migration (after the curve completes). Sign with `payer` + `signers`. */
export async function migrate(conn: Connection, p: { mint: PublicKey; payer: PublicKey }): Promise<{ tx: Transaction; signers: Keypair[] }> {
  const launch = await getLaunch(conn, p.mint)
  if (!launch) throw new Error(`No Holdfast launch for mint ${p.mint.toBase58()}`)
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const r = await dbc.migration.migrateToDammV2({ payer: p.payer, pool: launch.dbcPool, dammConfig: DAMM_V2_CONFIG })
  r.transaction.feePayer = p.payer
  return { tx: r.transaction, signers: [r.firstPositionNftKeypair, r.secondPositionNftKeypair] }
}

/** Swap on the graduated DAMM v2 pool: SOL → token (`solIn`) or token → SOL (`tokensIn`). No hook any more. */
export async function swapGraduated(
  conn: Connection,
  p: { owner: PublicKey; mint: PublicKey; solIn?: number; tokensIn?: bigint; slippageBps?: number },
): Promise<Transaction> {
  const cpAmm = new CpAmm(conn)
  const pool = graduatedPoolAddress(p.mint)
  const state = await cpAmm.fetchPoolState(pool)
  const buying = p.solIn !== undefined
  const inAmount = buying ? new BN(Math.round(p.solIn! * 1e9)) : new BN(p.tokensIn!.toString())
  const slot = await conn.getSlot('confirmed')
  const quote = cpAmm.getQuote({
    inAmount, inputTokenMint: buying ? NATIVE_MINT : p.mint, slippage: (p.slippageBps ?? 100) / 100, poolState: state,
    currentTime: Math.floor(Date.now() / 1000), currentSlot: slot, tokenADecimal: TOKEN_DECIMALS, tokenBDecimal: 9,
  })
  const tx = await cpAmm.swap({
    payer: p.owner, pool, inputTokenMint: buying ? NATIVE_MINT : p.mint, outputTokenMint: buying ? p.mint : NATIVE_MINT,
    amountIn: inAmount, minimumAmountOut: quote.minSwapOutAmount,
    tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
    tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
  })
  tx.feePayer = p.owner
  return tx
}
