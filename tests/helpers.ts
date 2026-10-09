/**
 * Shared harness for the Holdfast integration tests. Runs against a local validator with the REAL
 * Meteora programs (scripts/local-validator.sh, mainnet binaries) — see scripts/test.sh.
 */
import * as anchor from '@coral-xyz/anchor'
import * as sdk from '@holdfast/sdk'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
} from '@solana/spl-token'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DynamicFeeSharingClient } from '@meteora-ag/dynamic-fee-sharing-sdk'
import BN from 'bn.js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Holdfast } from '../target/types/holdfast'

export const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
export const conn = new Connection(RPC_URL, 'confirmed')
export const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? join(homedir(), '.config/solana/id.json'), 'utf8'))),
)
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(wallet), { commitment: 'confirmed' })
const idl = JSON.parse(readFileSync(join(__dirname, '../target/idl/holdfast.json'), 'utf8'))
export const program = new anchor.Program<Holdfast>(idl, provider)
export const HOLDFAST = program.programId
if (!HOLDFAST.equals(sdk.HOLDFAST_PROGRAM_ID)) throw new Error('target/idl and @holdfast/sdk disagree on the program id')
export const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
export const dfs = new DynamicFeeSharingClient(conn, 'confirmed')
/** Arena / Fair Launch split (holders / creator / treasury), DESIGN.md §4.2 */
export const DFS_SHARES = sdk.presets.arena.split
export const DECIMALS = sdk.TOKEN_DECIMALS
export const SUPPLY = sdk.TOTAL_SUPPLY

// ---------------------------------------------------------------------------------------------
// PDAs (from the SDK)
export const { launchPda, holderPda, rewardsAuthorityPda, rewardsVaultPda, wsolAta } = sdk
export const ata = sdk.holderTokenAccount

// ---------------------------------------------------------------------------------------------
// Tx plumbing
export type TxResult = { sig: string; logs: string[] }

export async function send(ixs: TransactionInstruction[] | Transaction, signers: Keypair[], opts: { computeBudget?: boolean } = {}): Promise<TxResult> {
  const tx = ixs instanceof Transaction ? ixs : new Transaction().add(...ixs)
  if (opts.computeBudget !== false && !tx.instructions.some((i) => i.programId.equals(ComputeBudgetProgram.programId))) {
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
  }
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' })
  const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  return { sig, logs: t?.meta?.logMessages ?? [] }
}

export function txLogs(e: unknown): string[] {
  if (e instanceof SendTransactionError) return (e as unknown as { transactionLogs?: string[] }).transactionLogs ?? e.logs ?? []
  return []
}

/** Asserts `fn` fails with the given Holdfast (Anchor) error name, visible in program logs. */
export async function expectError(fn: () => Promise<unknown>, name: string): Promise<string[]> {
  try {
    await fn()
  } catch (e) {
    const logs = txLogs(e)
    const text = logs.join('\n') + String((e as Error).message)
    if (!text.includes(`Error Code: ${name}`)) {
      throw new Error(`expected ${name}, got: ${String((e as Error).message).slice(0, 300)}\n${logs.slice(-8).join('\n')}`)
    }
    return logs
  }
  throw new Error(`expected ${name}, but the transaction succeeded`)
}

/**
 * Compute units consumed by Holdfast *as the transfer hook* in a tx: invocations nested under
 * Token-2022 (depth > 1). Top-level Holdfast instructions (register, init_launch, …) are excluded.
 */
export function hookComputeUnits(logs: string[]): number[] {
  const stack: { program: string; depth: number }[] = []
  const out: number[] = []
  for (const line of logs) {
    const invoke = line.match(/^Program (\w+) invoke \[(\d+)\]$/)
    if (invoke) {
      stack.push({ program: invoke[1], depth: Number(invoke[2]) })
      continue
    }
    const consumed = line.match(/^Program (\w+) consumed (\d+) of/)
    if (consumed && stack.length) {
      const top = stack[stack.length - 1]
      if (top.program === HOLDFAST.toBase58() && top.depth > 1) out.push(Number(consumed[2]))
      continue
    }
    if (/^Program \w+ (success|failed)/.test(line)) stack.pop()
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Clock
export async function clockNow(): Promise<number> {
  const info = await conn.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'processed')
  return Number(info!.data.readBigInt64LE(32))
}

export async function waitUntil(ts: number) {
  while ((await clockNow()) < ts) await new Promise((r) => setTimeout(r, 400))
}

// ---------------------------------------------------------------------------------------------
// Accounts
export const IS_LOCALNET = /127\.0\.0\.1|localhost/.test(RPC_URL)

/** Localnet: airdrop. Elsewhere (devnet): transfer from the test wallet. */
export async function airdrop(to: PublicKey, sol: number) {
  const lamports = Math.round(sol * LAMPORTS_PER_SOL)
  if (!IS_LOCALNET) {
    await send([SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: to, lamports })], [wallet])
    return
  }
  const sig = await conn.requestAirdrop(to, lamports)
  await conn.confirmTransaction(sig, 'confirmed')
}

export async function newActor(sol = 5): Promise<Keypair> {
  const kp = Keypair.generate()
  await airdrop(kp.publicKey, sol)
  return kp
}

export async function balanceOf(mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, ata(mint, owner), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount
  } catch {
    return 0n
  }
}

export const fetchLaunch = (mint: PublicKey) => program.account.launch.fetch(launchPda(mint))
export const fetchHolder = (mint: PublicKey, owner: PublicKey) => program.account.holder.fetchNullable(holderPda(ata(mint, owner)))

// ---------------------------------------------------------------------------------------------
// Launch creation — through @holdfast/sdk (Arena preset with test overrides)
export type LaunchOpts = {
  windowSecs: number
  snipeLockSecs: number
  maxWalletBps: number
  /** quote threshold in SOL (curve completes when reached) */
  thresholdSol?: number
  /** 'dfs' (DESIGN.md §6.1: DFS vault is the DBC fee claimer) or 'keeper' (fallback; test wallet is the fee claimer). Default keeper. */
  mode?: 'dfs' | 'keeper'
}

export type TestLaunch = {
  mint: PublicKey
  config: PublicKey
  pool: PublicKey
  baseVault: PublicKey
  launch: PublicKey
  creator: Keypair
  treasury: PublicKey
  /** DFS fee vault, or PublicKey.default in keeper mode */
  feeVault: PublicKey
  createSig: string
  opts: LaunchOpts
}

export function registerIxs(mint: PublicKey, owner: PublicKey, payer = owner): Promise<TransactionInstruction>[] {
  const both = sdk.registerIxs(conn, mint, owner, payer)
  return [both.then((x) => x[0]), both.then((x) => x[1])]
}

const rulesOf = (o: LaunchOpts) => ({ windowSecs: o.windowSecs, snipeLockSecs: o.snipeLockSecs, maxWalletBps: o.maxWalletBps })

/**
 * The §6.1 sequence via `sdk.createLaunch`. `override` is test-only: it swaps in a raw `init_launch`
 * (an impostor creator, or rules the SDK would refuse client-side) so the program's own guards run.
 */
export async function createLaunch(opts: LaunchOpts, override?: { initLaunchCreator?: Keypair }): Promise<TestLaunch & { createTxBytes: number }> {
  const creator = await newActor(IS_LOCALNET ? 2 : 0.03)
  const treasury = Keypair.generate().publicKey
  let rulesValid = true
  try {
    sdk.validateRules(rulesOf(opts))
  } catch {
    rulesValid = false
  }
  const prepared = await sdk.createLaunch(conn, {
    creator: creator.publicKey, payer: wallet.publicKey, name: 'Holdfast Test', symbol: 'HFT', uri: 'https://holdfast.example/t.json',
    preset: 'arena', network: 'localnet', treasury, feeMode: opts.mode ?? 'keeper', keeper: wallet.publicKey,
    overrides: {
      rules: rulesValid ? rulesOf(opts) : { windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 },
      thresholdSol: opts.thresholdSol ?? 5,
      fee: { startBps: 100, endBps: 100 }, // flat 1%: keeps token amounts predictable in tests
    },
  })
  const extra: Keypair[] = []
  let createSig = ''
  let createTxBytes = 0
  for (const [i, step] of prepared.steps.entries()) {
    const tx = await step.build()
    if (i === prepared.steps.length - 1 && (override?.initLaunchCreator || !rulesValid)) {
      const ixs = tx.instructions
      const at = ixs.findIndex((x) => x.programId.equals(HOLDFAST))
      const initCreator = override?.initLaunchCreator ?? creator
      ixs[at] = await sdk.initLaunchIx(conn, {
        mint: prepared.mint, pool: prepared.pool, config: prepared.config, creator: initCreator.publicKey, payer: wallet.publicKey,
        rules: rulesOf(opts), feeVault: prepared.feeVault,
      })
      // drop the creator's ATA + register (keeps the impostor variant under the size limit)
      if (initCreator !== creator) {
        ixs.splice(at + 1)
        extra.push(initCreator)
      }
    }
    createSig = (await send(tx, sdk.requiredSigners(tx, [wallet, creator, ...extra, ...step.signers]))).sig
    createTxBytes = tx.serialize().length
  }
  const baseVault = (await dbc.state.getPool(prepared.pool))!.poolState.baseVault
  return {
    mint: prepared.mint, config: prepared.config, pool: prepared.pool, baseVault, launch: prepared.launch, creator, treasury,
    feeVault: prepared.feeVault, createSig, opts, createTxBytes,
  }
}

// ---------------------------------------------------------------------------------------------
// Trading — through @holdfast/sdk

/**
 * Buy with `sol` SOL (ExactIn / PartialFill), or — with `tokensOut` — exactly that many base units
 * (ExactOut, spending at most `sol`). Registers only when `register` is set (the SDK default is to auto-register).
 */
export async function buy(l: TestLaunch, owner: Keypair, sol: number, o: { register?: boolean; partialFill?: boolean; tokensOut?: bigint } = {}) {
  const tx = await sdk.buy(conn, {
    owner: owner.publicKey, mint: l.mint, solIn: sol, tokensOut: o.tokensOut, partialFill: o.partialFill, autoRegister: !!o.register,
  })
  return send(tx, [owner])
}

export async function sell(l: TestLaunch, owner: Keypair, amount: bigint) {
  return send(await sdk.sell(conn, { owner: owner.publicKey, mint: l.mint, tokensIn: amount }), [owner])
}

export async function transferIx(mint: PublicKey, from: PublicKey, to: PublicKey, amount: bigint) {
  return createTransferCheckedWithTransferHookInstruction(
    conn, ata(mint, from), mint, ata(mint, to), from, amount, DECIMALS, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
  )
}

/** Wallet-to-wallet transfer (creates the destination ATA if needed). */
export async function transfer(mint: PublicKey, from: Keypair, to: PublicKey, amount: bigint) {
  return send(await sdk.transferTokens(conn, { from: from.publicKey, to, mint, amount }), [from])
}

export const bn = (x: BN | number | bigint) => BigInt(x.toString())

// ---------------------------------------------------------------------------------------------
// Graduation + rewards — through @holdfast/sdk

export const finalizeIx = (l: TestLaunch) => sdk.finalizeIx(conn, l.mint, l.pool)

/** DFS mode crank: DFS claim_fee(0) signed by the rewards PDA, then distribute. */
export const syncRewardsIx = (l: TestLaunch) => sdk.syncRewardsIx(conn, l.mint, l.feeVault)

/** Keeper mode: deposit `lamports` of wSOL from the depositor's wSOL ATA (wrapping SOL first). */
export const depositRewardsIxs = (l: TestLaunch, depositor: PublicKey, lamports: bigint) => sdk.depositRewardsIxs(conn, l.mint, depositor, lamports)

/** Claim into the owner's wSOL ATA (kept wrapped so tests can read exact amounts). */
export async function claimIxs(l: TestLaunch, owner: PublicKey) {
  return (await sdk.claim(conn, { owner, mint: l.mint, unwrap: false })).instructions
}

export async function tokenBalance(account: PublicKey): Promise<bigint> {
  try {
    return BigInt((await conn.getTokenAccountBalance(account, 'confirmed')).value.amount)
  } catch {
    return 0n
  }
}

/** floor(a × b / 2^64), mirroring math::mul_shr64 */
export const mulShr64 = (a: bigint, b: bigint) => (a * b) >> 64n
/** mirroring math::reward_per_point */
export const rewardPerPoint = (amount: bigint, total: bigint) => (total === 0n ? 0n : (amount << 64n) / total)
