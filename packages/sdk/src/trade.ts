/**
 * Bonding-phase trading. The DBC SDK resolves transfer-hook accounts with source = destination =
 * PublicKey.default, which can't derive Holdfast's key-seeded holder PDAs (VERIFICATION.md V4), so
 * every swap is patched with the real accounts. Those accounts are deterministic PDAs, so they are
 * derived locally (no RPC).
 */
import { AccountMeta, Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token'
import { ActivationType, DynamicBondingCurveClient, SwapMode, getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { DBC_POOL_AUTHORITY, DBC_PROGRAM_ID, HOLDFAST_PROGRAM_ID, TOKEN_DECIMALS } from './constants'
import { extraAccountMetaListPda, holderPda, holderPdaForOwner, holderTokenAccount, launchPda } from './pda'
import { holdfastProgram } from './program'
import { registerIxs } from './instructions'

/**
 * The extra accounts Token-2022 passes to the Holdfast hook for a transfer `source → destination`,
 * in ExtraAccountMetaList order: launch, source holder, destination holder, then the hook program
 * and the meta list itself (as the transfer-hook interface appends them).
 */
export function hookAccounts(mint: PublicKey, source: PublicKey, destination: PublicKey): AccountMeta[] {
  return [
    { pubkey: launchPda(mint), isSigner: false, isWritable: true },
    { pubkey: holderPda(source), isSigner: false, isWritable: true },
    { pubkey: holderPda(destination), isSigner: false, isWritable: true },
    { pubkey: HOLDFAST_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetaListPda(mint), isSigner: false, isWritable: false },
  ]
}

/** Replaces the DBC SDK's hook-account slice (the tail of the DBC instruction) with the real accounts. */
export function patchHookAccounts(tx: Transaction, mint: PublicKey, source: PublicKey, destination: PublicKey) {
  const ix = tx.instructions.find((i) => i.programId.equals(DBC_PROGRAM_ID))
  if (!ix) throw new Error('no DBC instruction to patch')
  const accounts = hookAccounts(mint, source, destination)
  ix.keys.splice(ix.keys.length - accounts.length, accounts.length, ...accounts)
}

// A launch's DBC pool and the pool's config never change: cache them (fewer RPC calls per trade).
const poolCache = new Map<string, PublicKey>()
const configCache = new Map<string, Awaited<ReturnType<DynamicBondingCurveClient['state']['getPoolConfig']>>>()

async function poolOf(conn: Connection, mint: PublicKey) {
  let poolAddress = poolCache.get(mint.toBase58())
  if (!poolAddress) {
    const launch = await holdfastProgram(conn).account.launch.fetchNullable(launchPda(mint))
    if (!launch) throw new Error(`No Holdfast launch for mint ${mint.toBase58()}`)
    poolAddress = launch.dbcPool
    poolCache.set(mint.toBase58(), poolAddress)
  }
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const pool = await dbc.state.getPool(poolAddress)
  if (!pool) throw new Error('DBC pool not found')
  const key = pool.poolState.config.toBase58()
  let config = configCache.get(key)
  if (!config) {
    config = await dbc.state.getPoolConfig(pool.poolState.config)
    if (!config) throw new Error('DBC config not found')
    configCache.set(key, config)
  }
  // Timestamp-activated pools (all Holdfast launches): the quote only needs "now"; skip two RPC calls
  const currentPoint = config.activationType === ActivationType.Timestamp
    ? new BN(Math.floor(Date.now() / 1000))
    : await getCurrentPoint(conn, config.activationType)
  return { dbc, poolAddress, pool, config, currentPoint }
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
  /**
   * Prepend ATA + `register` (idempotent). Default: only if the buyer has no holder record yet
   * (one extra RPC call). `true` always prepends, `false` never does.
   */
  autoRegister?: boolean
  payer?: PublicKey
}

/** Buy on the bonding curve. Registers the buyer on its first buy. */
export async function buy(conn: Connection, p: BuyParams): Promise<Transaction> {
  const { dbc, poolAddress, pool, config, currentPoint } = await poolOf(conn, p.mint)
  const amountIn = new BN(Math.round(p.solIn * 1_000_000_000))
  const base = { owner: p.owner, pool: poolAddress, swapBaseForQuote: false, referralTokenAccount: null, payer: p.payer }

  let tx: Transaction
  if (p.tokensOut !== undefined) {
    tx = await dbc.pool.swap2WithTransferHook({ ...base, swapMode: SwapMode.ExactOut, amountOut: new BN(p.tokensOut.toString()), maximumAmountIn: amountIn })
  } else {
    const swapMode = p.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn
    const quote = dbc.pool.swapQuote2({
      virtualPool: pool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false,
      currentPoint, slippageBps: p.slippageBps ?? 100, swapMode, amountIn,
    })
    tx = await dbc.pool.swap2WithTransferHook({ ...base, swapMode, amountIn, minimumAmountOut: quote.minimumAmountOut ?? new BN(0) })
  }
  patchHookAccounts(tx, p.mint, pool.poolState.baseVault, holderTokenAccount(p.mint, p.owner))

  const register = p.autoRegister ?? !(await conn.getAccountInfo(holderPdaForOwner(p.mint, p.owner)))
  if (register) tx.instructions.unshift(...(await registerIxs(conn, p.mint, p.owner, p.payer ?? p.owner)))
  tx.feePayer = p.payer ?? p.owner
  return tx
}

export type SellParams = { owner: PublicKey; mint: PublicKey; tokensIn: bigint; slippageBps?: number; payer?: PublicKey }

/** Sell on the bonding curve. Selling x% of a tracked balance forfeits x% of its points. */
export async function sell(conn: Connection, p: SellParams): Promise<Transaction> {
  const { dbc, poolAddress, pool, config, currentPoint } = await poolOf(conn, p.mint)
  const amountIn = new BN(p.tokensIn.toString())
  const quote = dbc.pool.swapQuote2({
    virtualPool: pool, config, swapBaseForQuote: true, hasReferral: false, eligibleForFirstSwapWithMinFee: false,
    currentPoint, slippageBps: p.slippageBps ?? 100, swapMode: SwapMode.ExactIn, amountIn,
  })
  const tx = await dbc.pool.swap2WithTransferHook({
    owner: p.owner, pool: poolAddress, swapBaseForQuote: true, referralTokenAccount: null, payer: p.payer,
    swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: quote.minimumAmountOut ?? new BN(0),
  })
  patchHookAccounts(tx, p.mint, holderTokenAccount(p.mint, p.owner), pool.poolState.baseVault)
  tx.feePayer = p.payer ?? p.owner
  return tx
}

/**
 * Wallet-to-wallet transfer of a Holdfast token (creates the recipient's ATA if needed). Works
 * after graduation too: Token-2022 ignores the extra accounts once the hook is revoked.
 */
export async function transferTokens(_conn: Connection, p: { from: PublicKey; to: PublicKey; mint: PublicKey; amount: bigint }): Promise<Transaction> {
  const src = holderTokenAccount(p.mint, p.from)
  const dst = holderTokenAccount(p.mint, p.to)
  const ix = createTransferCheckedInstruction(src, p.mint, dst, p.from, p.amount, TOKEN_DECIMALS, [], TOKEN_2022_PROGRAM_ID)
  ix.keys.push(...hookAccounts(p.mint, src, dst))
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(p.from, dst, p.to, p.mint, TOKEN_2022_PROGRAM_ID),
    ix,
  )
  tx.feePayer = p.from
  return tx
}

export { DBC_POOL_AUTHORITY }
