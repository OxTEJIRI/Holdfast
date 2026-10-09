/**
 * Bonding-phase trading. The DBC SDK resolves transfer-hook accounts with source = destination =
 * PublicKey.default, which can't derive Holdfast's key-seeded holder PDAs (VERIFICATION.md V4), so
 * every swap is patched with accounts resolved for the real source/destination.
 */
import { AccountMeta, Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
} from '@solana/spl-token'
import { DynamicBondingCurveClient, SwapMode, getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { DBC_POOL_AUTHORITY, DBC_PROGRAM_ID, TOKEN_DECIMALS } from './constants'
import { holderPdaForOwner, holderTokenAccount, launchPda } from './pda'
import { holdfastProgram } from './program'
import { registerIxs } from './instructions'

const LAMPORTS_PER_SOL = 1_000_000_000

/** Replaces the DBC SDK's hook-account slice (the tail of the DBC instruction) with correctly resolved accounts. */
export async function patchHookAccounts(conn: Connection, tx: Transaction, mint: PublicKey, source: PublicKey, destination: PublicKey, authority: PublicKey) {
  const ix = tx.instructions.find((i) => i.programId.equals(DBC_PROGRAM_ID))
  if (!ix) throw new Error('no DBC instruction to patch')
  const resolved = await createTransferCheckedWithTransferHookInstruction(
    conn, source, mint, destination, authority, 0n, TOKEN_DECIMALS, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
  )
  const hookAccounts: AccountMeta[] = resolved.keys.slice(4)
  ix.keys.splice(ix.keys.length - hookAccounts.length, hookAccounts.length, ...hookAccounts)
}

async function poolOf(conn: Connection, mint: PublicKey) {
  const launch = await holdfastProgram(conn).account.launch.fetchNullable(launchPda(mint))
  if (!launch) throw new Error(`No Holdfast launch for mint ${mint.toBase58()}`)
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const pool = await dbc.state.getPool(launch.dbcPool)
  if (!pool) throw new Error('DBC pool not found')
  const config = await dbc.state.getPoolConfig(pool.poolState.config)
  if (!config) throw new Error('DBC config not found')
  return { dbc, launch, poolAddress: launch.dbcPool, pool, config }
}

export type BuyParams = {
  owner: PublicKey
  mint: PublicKey
  /** SOL to spend (ExactIn) — or the max to spend when `tokensOut` is set */
  solIn: number
  /** slippage tolerance; default 1% */
  slippageBps?: number
  /** buy exactly this many base units (ExactOut) */
  tokensOut?: bigint
  /** PartialFill: fill up to the curve's end (for the trade that completes it) */
  partialFill?: boolean
  /** prepend ATA + `register` if the buyer has no holder record (default true) */
  autoRegister?: boolean
  payer?: PublicKey
}

/** Buy on the bonding curve. Prepends ATA + `register` when the buyer has no holder record yet. */
export async function buy(conn: Connection, p: BuyParams): Promise<Transaction> {
  const { dbc, launch, poolAddress, pool, config } = await poolOf(conn, p.mint)
  const amountIn = new BN(Math.round(p.solIn * LAMPORTS_PER_SOL))
  const base = { owner: p.owner, pool: poolAddress, swapBaseForQuote: false, referralTokenAccount: null, payer: p.payer }

  let tx: Transaction
  if (p.tokensOut !== undefined) {
    tx = await dbc.pool.swap2WithTransferHook({ ...base, swapMode: SwapMode.ExactOut, amountOut: new BN(p.tokensOut.toString()), maximumAmountIn: amountIn })
  } else {
    const swapMode = p.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn
    const quote = dbc.pool.swapQuote2({
      virtualPool: pool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false,
      currentPoint: await getCurrentPoint(conn, config.activationType), slippageBps: p.slippageBps ?? 100, swapMode, amountIn,
    })
    tx = await dbc.pool.swap2WithTransferHook({ ...base, swapMode, amountIn, minimumAmountOut: quote.minimumAmountOut ?? new BN(0) })
  }
  await patchHookAccounts(conn, tx, p.mint, pool.poolState.baseVault, holderTokenAccount(p.mint, p.owner), DBC_POOL_AUTHORITY)

  if (p.autoRegister !== false && !launch.finalized && !(await conn.getAccountInfo(holderPdaForOwner(p.mint, p.owner)))) {
    tx.instructions.unshift(...(await registerIxs(conn, p.mint, p.owner, p.payer ?? p.owner)))
  }
  tx.feePayer = p.payer ?? p.owner
  return tx
}

export type SellParams = { owner: PublicKey; mint: PublicKey; tokensIn: bigint; slippageBps?: number; payer?: PublicKey }

/** Sell on the bonding curve. Selling x% of a tracked balance forfeits x% of its points. */
export async function sell(conn: Connection, p: SellParams): Promise<Transaction> {
  const { dbc, poolAddress, pool, config } = await poolOf(conn, p.mint)
  const amountIn = new BN(p.tokensIn.toString())
  const quote = dbc.pool.swapQuote2({
    virtualPool: pool, config, swapBaseForQuote: true, hasReferral: false, eligibleForFirstSwapWithMinFee: false,
    currentPoint: await getCurrentPoint(conn, config.activationType), slippageBps: p.slippageBps ?? 100, swapMode: SwapMode.ExactIn, amountIn,
  })
  const tx = await dbc.pool.swap2WithTransferHook({
    owner: p.owner, pool: poolAddress, swapBaseForQuote: true, referralTokenAccount: null, payer: p.payer,
    swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: quote.minimumAmountOut ?? new BN(0),
  })
  await patchHookAccounts(conn, tx, p.mint, holderTokenAccount(p.mint, p.owner), pool.poolState.baseVault, p.owner)
  tx.feePayer = p.payer ?? p.owner
  return tx
}

/** Wallet-to-wallet transfer of a Holdfast token (creates the recipient's ATA if needed). */
export async function transferTokens(conn: Connection, p: { from: PublicKey; to: PublicKey; mint: PublicKey; amount: bigint }): Promise<Transaction> {
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(p.from, holderTokenAccount(p.mint, p.to), p.to, p.mint, TOKEN_2022_PROGRAM_ID),
    await createTransferCheckedWithTransferHookInstruction(
      conn, holderTokenAccount(p.mint, p.from), p.mint, holderTokenAccount(p.mint, p.to), p.from, p.amount, TOKEN_DECIMALS, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
    ),
  )
  tx.feePayer = p.from
  return tx
}
