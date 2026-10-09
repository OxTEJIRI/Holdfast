/**
 * Shared harness for the Holdfast integration tests. Runs against a local validator with the REAL
 * Meteora programs (scripts/local-validator.sh, mainnet binaries) — see scripts/test.sh.
 */
import * as anchor from '@coral-xyz/anchor'
import {
  AccountMeta,
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
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  SwapMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  deriveDbcPoolAddress,
  deriveDbcPoolAuthority,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  DynamicFeeSharingClient,
  deriveFeeVaultPdaAddress,
  deriveTokenVaultAddress,
} from '@meteora-ag/dynamic-fee-sharing-sdk'
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
export const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
export const POOL_AUTHORITY = deriveDbcPoolAuthority()
export const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
export const dfs = new DynamicFeeSharingClient(conn, 'confirmed')
export const DFS = new PublicKey('dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh')
/** DFS split (holders / creator / treasury), DESIGN.md §4.2 Fair Launch */
export const DFS_SHARES = { holders: 60, creator: 30, treasury: 10 }
export const DECIMALS = 6
export const SUPPLY = 1_000_000_000n * 10n ** 6n

// ---------------------------------------------------------------------------------------------
// PDAs
const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, HOLDFAST)[0]
export const launchPda = (mint: PublicKey) => pda([Buffer.from('launch'), mint.toBuffer()])
export const holderPda = (tokenAccount: PublicKey) => pda([Buffer.from('holder'), tokenAccount.toBuffer()])
export const rewardsAuthorityPda = (mint: PublicKey) => pda([Buffer.from('rewards'), mint.toBuffer()])
export const rewardsVaultPda = (mint: PublicKey) => pda([Buffer.from('rewards_vault'), mint.toBuffer()])
export const wsolAta = (owner: PublicKey) => getAssociatedTokenAddressSync(NATIVE_MINT, owner, true, TOKEN_PROGRAM_ID)
export const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID)

// ---------------------------------------------------------------------------------------------
// Tx plumbing
export type TxResult = { sig: string; logs: string[] }

export async function send(ixs: TransactionInstruction[] | Transaction, signers: Keypair[]): Promise<TxResult> {
  const tx = ixs instanceof Transaction ? ixs : new Transaction().add(...ixs)
  if (!tx.instructions.some((i) => i.programId.equals(ComputeBudgetProgram.programId))) {
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
// Launch creation
export type LaunchOpts = {
  windowSecs: number
  snipeLockSecs: number
  maxWalletBps: number
  /** quote threshold in SOL (curve completes when reached) */
  thresholdSol?: number
  /** 'dfs' (DESIGN.md §6.1: DFS vault is the DBC fee claimer) or 'keeper' (fallback; test wallet is the fee claimer). Default keeper. */
  mode?: 'dfs' | 'keeper'
  feeVault?: PublicKey
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

export function curveConfig(thresholdSol: number) {
  return buildCurve({
    token: {
      tokenType: TokenType.Token2022, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 0,
      poolCreationFee: 0, enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.Compounding, dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100, compoundingFeeBps: 5000,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityVestingInfoParams: {
        vestingPercentage: 50, bpsPerPeriod: 111, numberOfPeriods: 90,
        cliffDurationFromMigrationTime: 7 * 86400, totalDuration: 90 * 86400,
      },
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: thresholdSol,
  })
}

export function registerIxs(mint: PublicKey, owner: PublicKey, payer = owner): Promise<TransactionInstruction>[] {
  const tokenAccount = ata(mint, owner)
  return [
    Promise.resolve(createAssociatedTokenAccountIdempotentInstruction(payer, tokenAccount, owner, mint, TOKEN_2022_PROGRAM_ID)),
    program.methods.register().accountsPartial({
      payer, owner, launch: launchPda(mint), mint, tokenAccount, holder: holderPda(tokenAccount),
      token2022Program: TOKEN_2022_PROGRAM_ID,
    }).instruction(),
  ]
}

export async function initLaunchIx(args: {
  mint: PublicKey; pool: PublicKey; config: PublicKey; creator: PublicKey; payer: PublicKey; opts: LaunchOpts
}) {
  return program.methods
    .initLaunch({
      windowSecs: args.opts.windowSecs,
      snipeLockSecs: args.opts.snipeLockSecs,
      maxWalletBps: args.opts.maxWalletBps,
      feeVault: args.opts.feeVault ?? PublicKey.default,
    })
    .accountsPartial({
      payer: args.payer, creator: args.creator, mint: args.mint, dbcPool: args.pool, dbcConfig: args.config,
      quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction()
}

/** DBC hook config (feeClaimer = test wallet, i.e. keeper mode) + one tx: pool, init_launch, creator register. */
export async function createLaunch(opts: LaunchOpts, override?: { initLaunchCreator?: Keypair }): Promise<TestLaunch & { createTxBytes: number }> {
  const creator = await newActor(IS_LOCALNET ? 2 : 0.03)
  const configKp = Keypair.generate()
  const mintKp = Keypair.generate()
  const mint = mintKp.publicKey
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint, configKp.publicKey)
  const treasury = Keypair.generate().publicKey
  const dfsMode = opts.mode === 'dfs'
  const feeVault = dfsMode ? deriveFeeVaultPdaAddress(configKp.publicKey, NATIVE_MINT) : PublicKey.default

  // §6.1 Tx A: DFS fee vault PDA (base = config keypair), shareholders [rewards PDA, creator, treasury]
  if (dfsMode) {
    await send(await dfs.createFeeVaultPda({
      base: configKp.publicKey, tokenMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
      owner: creator.publicKey, payer: wallet.publicKey,
      userShare: [
        { address: rewardsAuthorityPda(mint), share: DFS_SHARES.holders },
        { address: creator.publicKey, share: DFS_SHARES.creator },
        { address: treasury, share: DFS_SHARES.treasury },
      ],
    }), [wallet, configKp])
  }

  // §6.1 Tx B: DBC transfer-hook config; fee claimer = DFS vault (or the keeper wallet)
  await send(await dbc.partner.createConfigWithTransferHook({
    config: configKp.publicKey, feeClaimer: dfsMode ? feeVault : wallet.publicKey, leftoverReceiver: treasury, payer: wallet.publicKey,
    quoteMint: NATIVE_MINT, transferHookProgram: HOLDFAST, ...curveConfig(opts.thresholdSol ?? 5),
  }), [wallet, configKp])

  const poolTx = await dbc.creator.createPoolWithTransferHook({
    baseMint: mint, config: configKp.publicKey, name: 'Holdfast Test', symbol: 'HFT', uri: 'https://holdfast.example/t.json',
    payer: wallet.publicKey, poolCreator: creator.publicKey, transferHookProgram: HOLDFAST,
  })
  const initCreator = override?.initLaunchCreator ?? creator
  // §6.1 Tx C: pool + init_launch + creator register, atomically
  poolTx.add(await initLaunchIx({ mint, pool, config: configKp.publicKey, creator: initCreator.publicKey, payer: wallet.publicKey, opts: { ...opts, feeVault } }))
  // creator registers in the same tx (skipped for the impostor variant to stay under the size limit)
  if (initCreator === creator) poolTx.add(...(await Promise.all(registerIxs(mint, creator.publicKey, wallet.publicKey))))
  const signers = [wallet, mintKp, creator, ...(initCreator === creator ? [] : [initCreator])]
  const { sig } = await send(poolTx, signers)
  const createTxBytes = poolTx.serialize().length
  const baseVault = (await dbc.state.getPool(pool))!.poolState.baseVault
  return { mint, config: configKp.publicKey, pool, baseVault, launch: launchPda(mint), creator, treasury, feeVault, createSig: sig, opts, createTxBytes }
}

// ---------------------------------------------------------------------------------------------
// Trading

/**
 * The DBC SDK resolves hook extras with source = destination = PublicKey.default, which is wrong
 * for Holdfast's key-seeded holder PDAs (docs/VERIFICATION.md V4). Re-resolve for the real
 * accounts and splice over the SDK's hook slice.
 */
export async function patchHookAccounts(tx: Transaction, mint: PublicKey, source: PublicKey, destination: PublicKey, authority: PublicKey) {
  const ix = tx.instructions.find((i) => i.programId.equals(DBC))!
  const resolved = await createTransferCheckedWithTransferHookInstruction(
    conn, source, mint, destination, authority, 0n, DECIMALS, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
  )
  const hookAccounts: AccountMeta[] = resolved.keys.slice(4)
  ix.keys.splice(ix.keys.length - hookAccounts.length, hookAccounts.length, ...hookAccounts)
}

/**
 * Buy with `sol` SOL (ExactIn / PartialFill), or — with `tokensOut` — exactly that many base units
 * (ExactOut, spending at most `sol`).
 */
export async function buy(l: TestLaunch, owner: Keypair, sol: number, o: { register?: boolean; partialFill?: boolean; tokensOut?: bigint } = {}) {
  const lamports = new BN(Math.round(sol * LAMPORTS_PER_SOL))
  const base = { owner: owner.publicKey, pool: l.pool, swapBaseForQuote: false, referralTokenAccount: null }
  const tx = await dbc.pool.swap2WithTransferHook(
    o.tokensOut !== undefined
      ? { ...base, swapMode: SwapMode.ExactOut, amountOut: new BN(o.tokensOut.toString()), maximumAmountIn: lamports }
      : { ...base, swapMode: o.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn, amountIn: lamports, minimumAmountOut: new BN(0) },
  )
  await patchHookAccounts(tx, l.mint, l.baseVault, ata(l.mint, owner.publicKey), POOL_AUTHORITY)
  if (o.register) tx.instructions.unshift(...(await Promise.all(registerIxs(l.mint, owner.publicKey))))
  return send(tx, [owner])
}

export async function sell(l: TestLaunch, owner: Keypair, amount: bigint) {
  const tx = await dbc.pool.swap2WithTransferHook({
    owner: owner.publicKey, pool: l.pool, swapBaseForQuote: true, referralTokenAccount: null,
    swapMode: SwapMode.ExactIn, amountIn: new BN(amount.toString()), minimumAmountOut: new BN(0),
  })
  await patchHookAccounts(tx, l.mint, ata(l.mint, owner.publicKey), l.baseVault, owner.publicKey)
  return send(tx, [owner])
}

export async function transferIx(mint: PublicKey, from: PublicKey, to: PublicKey, amount: bigint) {
  return createTransferCheckedWithTransferHookInstruction(
    conn, ata(mint, from), mint, ata(mint, to), from, amount, DECIMALS, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
  )
}

/** Wallet-to-wallet transfer (creates the destination ATA if needed). */
export async function transfer(mint: PublicKey, from: Keypair, to: PublicKey, amount: bigint) {
  return send([
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, ata(mint, to), to, mint, TOKEN_2022_PROGRAM_ID),
    await transferIx(mint, from.publicKey, to, amount),
  ], [from])
}

export const bn = (x: BN | number | bigint) => BigInt(x.toString())

// ---------------------------------------------------------------------------------------------
// Graduation + rewards

export const finalizeIx = (l: TestLaunch) =>
  program.methods.finalize().accountsPartial({ launch: l.launch, mint: l.mint, dbcPool: l.pool }).instruction()

/** DFS mode crank: DFS claim_fee(0) signed by the rewards PDA, then distribute. */
export const syncRewardsIx = (l: TestLaunch) =>
  program.methods.syncRewards(0).accountsPartial({
    launch: l.launch, rewardsAuthority: rewardsAuthorityPda(l.mint), rewardsVault: rewardsVaultPda(l.mint), quoteMint: NATIVE_MINT,
    dfsFeeVault: l.feeVault, dfsTokenVault: deriveTokenVaultAddress(l.feeVault),
    dfsFeeVaultAuthority: new PublicKey('EYqHRdtepv1KKUkPAYMBYpSfiGfNd8sa55ZtswodTfBS'),
    dfsEventAuthority: new PublicKey('EjRrm5Ptzzbp4fft5k4oC9LvbXqVA4UV4Sc9RNULDhCA'), dfsProgram: DFS, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction()

/** Keeper mode: deposit `lamports` of wSOL from the depositor's wSOL ATA (wrapping SOL first). */
export async function depositRewardsIxs(l: TestLaunch, depositor: PublicKey, lamports: bigint) {
  const src = wsolAta(depositor)
  return [
    createAssociatedTokenAccountIdempotentInstruction(depositor, src, depositor, NATIVE_MINT, TOKEN_PROGRAM_ID),
    SystemProgram.transfer({ fromPubkey: depositor, toPubkey: src, lamports }),
    createSyncNativeInstruction(src, TOKEN_PROGRAM_ID),
    await program.methods.depositRewards(new BN(lamports.toString())).accountsPartial({
      depositor, launch: l.launch, rewardsVault: rewardsVaultPda(l.mint), depositorTokenAccount: src,
      quoteMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction(),
  ]
}

/** Claim into the owner's wSOL ATA (kept wrapped so tests can read exact amounts). */
export async function claimIxs(l: TestLaunch, owner: PublicKey) {
  const dest = wsolAta(owner)
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, dest, owner, NATIVE_MINT, TOKEN_PROGRAM_ID),
    await program.methods.claim().accountsPartial({
      owner, launch: l.launch, holder: holderPda(ata(l.mint, owner)), rewardsAuthority: rewardsAuthorityPda(l.mint),
      rewardsVault: rewardsVaultPda(l.mint), destination: dest, quoteMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction(),
  ]
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
