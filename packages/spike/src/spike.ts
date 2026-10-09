/**
 * Phase 0 verification spike (DESIGN.md §10, Phase 0).
 *
 * Drives the full Meteora flow against a transfer-hook pool whose hook is the no-op Holdfast
 * spike program, and records every tx + finding to out/<cluster>.json:
 *   DFS vault PDA → DBC hook config (feeClaimer = DFS vault) → pool + ExtraAccountMetaList in one tx
 *   → first-time buy (SDK auto-resolved accounts, then our resolved accounts) → sell
 *   → DFS fund_by_claiming_fee(ClaimTradingFee2) → push curve to completion → hook revoked
 *   → migrateToDammV2 (Compounding) → DAMM v2 swap → DFS fund_by_claiming_fee(ClaimPositionFee)
 *
 * Usage: RPC_URL=http://127.0.0.1:8899 pnpm spike     (default: local validator)
 *        RPC_URL=https://api.devnet.solana.com pnpm spike
 */
import {
  AccountMeta,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
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
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferHook,
  getAccount,
} from '@solana/spl-token'
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
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
  deriveDammV2PoolAddress,
  deriveDbcPoolAddress,
  deriveDbcPoolAuthority,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  DynamicFeeSharingClient,
  deriveFeeVaultPdaAddress,
  deriveTokenVaultAddress,
} from '@meteora-ag/dynamic-fee-sharing-sdk'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
const CLUSTER = RPC_URL.includes('devnet') ? 'devnet' : RPC_URL.includes('mainnet') ? 'mainnet' : 'localnet'
if (CLUSTER === 'mainnet') throw new Error('spike refuses to run on mainnet')
const EXPLORER = (sig: string) =>
  CLUSTER === 'devnet'
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`

const HOLDFAST = new PublicKey('E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw')
const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
// PoolState.finish_curve_timestamp: 8 (disc) + 64 + 5*32 + 6*8 + 16 + 8 + 8*1 + 32 (metrics) = 344
const FINISH_CURVE_TS_OFFSET = 344
// Spike threshold: tiny so the devnet run is cheap.
const MIGRATION_QUOTE_THRESHOLD_SOL = Number(process.env.THRESHOLD_SOL ?? 0.5)

const conn = new Connection(RPC_URL, 'confirmed')
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? join(homedir(), '.config/solana/id.json'), 'utf8'))),
)
const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
const dfs = new DynamicFeeSharingClient(conn, 'confirmed')
const cpAmm = new CpAmm(conn)

// ---------------------------------------------------------------------------------------------
// Recording
type Step = { step: string; ok: boolean; sig?: string; explorer?: string; note?: string; logs?: string[] }
const record: { cluster: string; rpc: string; startedAt: string; keys: Record<string, string>; steps: Step[]; findings: Record<string, unknown> } = {
  cluster: CLUSTER,
  rpc: RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'),
  startedAt: new Date().toISOString(),
  keys: {},
  steps: [],
  findings: {},
}
// LABEL distinguishes local runs against different program binaries (e.g. mainnet-bins / devnet-bins)
const LABEL = process.env.LABEL ? `-${process.env.LABEL}` : ''
const OUT = join(HERE, '..', 'out', `${CLUSTER}${LABEL}.json`)
function save() {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(record, null, 2))
}
function step(s: Step) {
  record.steps.push(s.sig ? { ...s, explorer: EXPLORER(s.sig) } : s)
  console.log(`${s.ok ? '✔' : '✘'} ${s.step}${s.sig ? `  ${s.sig}` : ''}${s.note ? `\n    ${s.note}` : ''}`)
  save()
}
function finding(key: string, value: unknown) {
  record.findings[key] = value
  console.log(`  ↳ ${key}: ${JSON.stringify(value)}`)
  save()
}

/** Adds a 1M CU limit unless the SDK already set compute-budget instructions. */
function withCuLimit(tx: Transaction) {
  if (!tx.instructions.some((i) => i.programId.equals(ComputeBudgetProgram.programId))) {
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }))
  }
}

async function send(name: string, tx: Transaction, signers: Keypair[], note?: string): Promise<string> {
  withCuLimit(tx)
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' })
    step({ step: name, ok: true, sig, note })
    return sig
  } catch (e) {
    const logs = e instanceof SendTransactionError ? (e as unknown as { transactionLogs?: string[] }).transactionLogs ?? e.logs : undefined
    step({ step: name, ok: false, note: String((e as Error).message ?? e).slice(0, 400), logs: logs?.slice(-15) })
    console.log((logs ?? []).slice(-15).join('\n'))
    throw e
  }
}

/** Simulates a tx we expect to fail and records the error (no SOL spent). */
async function expectFailure(name: string, tx: Transaction, signers: Keypair[]): Promise<string[]> {
  withCuLimit(tx)
  tx.feePayer = signers[0].publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash
  tx.sign(...signers)
  const sim = await conn.simulateTransaction(tx)
  const logs = sim.value.logs ?? []
  step({ step: name, ok: sim.value.err !== null, note: `simulation err = ${JSON.stringify(sim.value.err)}`, logs: logs.slice(-8) })
  return logs
}

async function fund(to: PublicKey, sol: number) {
  if (CLUSTER === 'localnet') {
    const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL)
    await conn.confirmTransaction(sig, 'confirmed')
    return
  }
  await send(`fund ${to.toBase58().slice(0, 6)}… ${sol} SOL`, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
  ), [wallet])
}

// ---------------------------------------------------------------------------------------------
// Holdfast spike program helpers
const splDisc = (s: string) => createHash('sha256').update(s).digest().subarray(0, 8)
const INIT_EXTRA_METAS_DISC = splDisc('spl-transfer-hook-interface:initialize-extra-account-metas')
const pda = (seeds: (Buffer | Uint8Array)[], program = HOLDFAST) => PublicKey.findProgramAddressSync(seeds, program)[0]
const extraMetaListPda = (mint: PublicKey) => pda([Buffer.from('extra-account-metas'), mint.toBuffer()])
const launchPda = (mint: PublicKey) => pda([Buffer.from('launch'), mint.toBuffer()])
const holderPda = (tokenAccount: PublicKey) => pda([Buffer.from('holder'), tokenAccount.toBuffer()])
const rewardsPda = (mint: PublicKey) => pda([Buffer.from('rewards'), mint.toBuffer()])

function initExtraMetasIx(payer: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({
    programId: HOLDFAST,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: extraMetaListPda(mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(INIT_EXTRA_METAS_DISC),
  })
}

/**
 * The DBC SDK resolves hook accounts with source = destination = PublicKey.default, so key-seeded
 * extras resolve to the wrong PDAs. Re-resolve them for the real (source, destination, authority)
 * and splice them over the SDK's hook slice at the end of the DBC instruction.
 */
async function patchHookAccounts(tx: Transaction, mint: PublicKey, source: PublicKey, destination: PublicKey, authority: PublicKey) {
  const ix = tx.instructions.find((i) => i.programId.equals(DBC))
  if (!ix) throw new Error('no DBC ix in tx')
  const resolved = await createTransferCheckedWithTransferHookInstruction(
    conn, source, mint, destination, authority, 0n, 6, [], 'confirmed', TOKEN_2022_PROGRAM_ID,
  )
  const hookAccounts: AccountMeta[] = resolved.keys.slice(4)
  ix.keys.splice(ix.keys.length - hookAccounts.length, hookAccounts.length, ...hookAccounts)
  return hookAccounts
}

const hookLogs = (logs: string[]) => logs.filter((l) => l.includes('holdfast hook:'))
async function txLogs(sig: string) {
  const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  return t?.meta?.logMessages ?? []
}

// ---------------------------------------------------------------------------------------------
async function main() {
  console.log(`cluster=${CLUSTER} wallet=${wallet.publicKey.toBase58()}`)
  if (CLUSTER === 'localnet') await fund(wallet.publicKey, 100)
  const startBalance = await conn.getBalance(wallet.publicKey)
  console.log(`balance ${startBalance / LAMPORTS_PER_SOL} SOL`)

  // ---- 0. Static facts
  const poolAuthority = deriveDbcPoolAuthority()
  const derivedAuthority = PublicKey.findProgramAddressSync([Buffer.from('pool_authority')], DBC)[0]
  finding('poolAuthority', { sdk: poolAuthority.toBase58(), derived: derivedAuthority.toBase58(), match: poolAuthority.equals(derivedAuthority) })
  const hookInfo = await conn.getAccountInfo(HOLDFAST)
  finding('hookProgramExecutable', hookInfo?.executable ?? false)
  for (const [name, id] of Object.entries({ DBC, DFS: new PublicKey('dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh'), DAMMv2: new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG') })) {
    finding(`program.${name}.executable`, (await conn.getAccountInfo(id))?.executable ?? false)
  }
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]
  finding('dammConfig(Customizable)', { key: dammConfig.toBase58(), owner: (await conn.getAccountInfo(dammConfig))?.owner.toBase58() })

  // ---- keys
  const configKp = Keypair.generate()
  const mintKp = Keypair.generate()
  const treasury = Keypair.generate().publicKey
  const creator = wallet
  const buyer = Keypair.generate()
  const buyer2 = Keypair.generate()
  const mint = mintKp.publicKey
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint, configKp.publicKey)
  const feeVault = deriveFeeVaultPdaAddress(configKp.publicKey, NATIVE_MINT)
  Object.assign(record.keys, {
    wallet: wallet.publicKey.toBase58(), config: configKp.publicKey.toBase58(), mint: mint.toBase58(),
    pool: pool.toBase58(), feeVault: feeVault.toBase58(), rewardsPda: rewardsPda(mint).toBase58(),
    treasury: treasury.toBase58(), buyer: buyer.publicKey.toBase58(), buyer2: buyer2.publicKey.toBase58(),
  })
  save()
  await fund(buyer.publicKey, MIGRATION_QUOTE_THRESHOLD_SOL * 1.6 + 0.2)
  await fund(buyer2.publicKey, 0.02)

  // ---- A. DFS fee vault PDA (base = config keypair)
  const txA = await dfs.createFeeVaultPda({
    base: configKp.publicKey, tokenMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    owner: creator.publicKey, payer: wallet.publicKey,
    userShare: [
      { address: rewardsPda(mint), share: 60 },
      { address: creator.publicKey, share: 30 },
      { address: treasury, share: 10 },
    ],
  })
  await send('A. DFS initialize_fee_vault_pda (base = DBC config keypair)', txA, [wallet, configKp])

  // ---- B. DBC config with transfer hook
  const curve = (tokenAuthorityOption: TokenAuthorityOption) => buildCurve({
    token: {
      tokenType: TokenType.Token2022, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption, totalTokenSupply: 1_000_000_000, leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: { startingFeeBps: 3000, endingFeeBps: 100, numberOfPeriod: 10, totalDuration: 30 },
      },
      dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 0,
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
    migrationQuoteThreshold: MIGRATION_QUOTE_THRESHOLD_SOL,
  })
  const configTx = (opt: TokenAuthorityOption) => dbc.partner.createConfigWithTransferHook({
    config: configKp.publicKey, feeClaimer: feeVault, leftoverReceiver: treasury, payer: wallet.publicKey,
    quoteMint: NATIVE_MINT, transferHookProgram: HOLDFAST, ...curve(opt),
  })
  let tokenAuthority = TokenAuthorityOption.Immutable
  try {
    await send('B. DBC createConfigWithTransferHook (tokenAuthorityOption = Immutable, feeClaimer = DFS vault PDA)', await configTx(tokenAuthority), [wallet, configKp])
    finding('immutableAuthorityAcceptedForHookConfig', true)
  } catch {
    finding('immutableAuthorityAcceptedForHookConfig', false)
    tokenAuthority = TokenAuthorityOption.CreatorUpdateAuthority
    await send('B. DBC createConfigWithTransferHook (fallback CreatorUpdateAuthority)', await configTx(tokenAuthority), [wallet, configKp])
  }

  // ---- C. pool + ExtraAccountMetaList in the same tx (meta list created AFTER the pool ix)
  const txC = await dbc.creator.createPoolWithTransferHook({
    baseMint: mint, config: configKp.publicKey, name: 'Holdfast Spike', symbol: 'HFSPK',
    uri: 'https://holdfast.example/spike.json', payer: wallet.publicKey, poolCreator: creator.publicKey,
    transferHookProgram: HOLDFAST,
  })
  txC.add(initExtraMetasIx(wallet.publicKey, mint))
  await send('C. DBC createPoolWithTransferHook + Holdfast initialize_extra_account_meta_list (same tx)', txC, [wallet, mintKp])
  const mintInfo = await getMint(conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const hook = getTransferHook(mintInfo)
  finding('mintAfterCreate', {
    transferHookProgramId: hook?.programId.toBase58(), transferHookAuthority: hook?.authority.toBase58(),
    mintAuthority: mintInfo.mintAuthority?.toBase58() ?? null, freezeAuthority: mintInfo.freezeAuthority?.toBase58() ?? null,
    supply: mintInfo.supply.toString(),
  })
  finding('metaListCreatedAfterPoolInSameTx', (await conn.getAccountInfo(extraMetaListPda(mint)))?.owner.equals(HOLDFAST) ?? false)

  const poolState = (await dbc.state.getPool(pool))!.poolState
  const baseVault = poolState.baseVault
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID)

  // ---- D. first-time buy
  const buyLamports = new BN(Math.round(0.05 * LAMPORTS_PER_SOL))
  const buyTx = () => dbc.pool.swap2WithTransferHook({
    owner: buyer.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null,
    swapMode: SwapMode.ExactIn, amountIn: buyLamports, minimumAmountOut: new BN(0),
  })
  const sdkTx = await buyTx()
  const dbcIx = sdkTx.instructions.find((i) => i.programId.equals(DBC))!
  finding('sdkResolvedHookAccounts(buy)', dbcIx.keys.slice(-6).map((k) => k.pubkey.toBase58()))
  finding('expectedHookAccounts(buy)', {
    launch: launchPda(mint).toBase58(), srcHolder: holderPda(baseVault).toBase58(), dstHolder: holderPda(buyerAta).toBase58(),
    holderOfDefaultKey: holderPda(PublicKey.default).toBase58(),
  })
  const autoLogs = await expectFailure('D1. buy with SDK auto-resolved hook accounts (first-time buyer) — expected to FAIL', sdkTx, [buyer])
  finding('sdkAutoResolveWorksForKeySeededExtras', !autoLogs.some((l) => /failed|error/i.test(l)))

  const patched = await buyTx()
  const used = await patchHookAccounts(patched, mint, baseVault, buyerAta, poolAuthority)
  const buySig = await send('D2. buy via swap2WithTransferHook with Holdfast-resolved hook accounts (first-time buyer)', patched, [buyer],
    `hook accounts: ${used.map((k) => k.pubkey.toBase58()).join(', ')}`)
  finding('hookLogs(buy)', hookLogs(await txLogs(buySig)))
  const bal = (await getAccount(conn, buyerAta, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount
  finding('buyerBaseBalanceAfterBuy', bal.toString())

  // ---- E. sell 25%
  const sellAmount = new BN((bal / 4n).toString())
  const sellTx = await dbc.pool.swap2WithTransferHook({
    owner: buyer.publicKey, pool, swapBaseForQuote: true, referralTokenAccount: null,
    swapMode: SwapMode.ExactIn, amountIn: sellAmount, minimumAmountOut: new BN(0),
  })
  await patchHookAccounts(sellTx, mint, buyerAta, baseVault, buyer.publicKey)
  const sellSig = await send('E. sell 25% via swap2WithTransferHook (resolved hook accounts)', sellTx, [buyer])
  finding('hookLogs(sell)', hookLogs(await txLogs(sellSig)))

  // ---- F. wallet-to-wallet transfer while hook active (plain spl-token helper resolves extras itself)
  const buyer2Ata = getAssociatedTokenAddressSync(mint, buyer2.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const w2w = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(buyer.publicKey, buyer2Ata, buyer2.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    await createTransferCheckedWithTransferHookInstruction(conn, buyerAta, mint, buyer2Ata, buyer.publicKey, 1_000_000n, 6, [], 'confirmed', TOKEN_2022_PROGRAM_ID),
  )
  const w2wSig = await send('F. wallet→wallet transferChecked with hook (spl-token resolver)', w2w, [buyer])
  finding('hookLogs(w2w)', hookLogs(await txLogs(w2wSig)))

  // ---- G. finishCurveTimestamp layout check (before completion)
  const readFinishTs = async () => (await conn.getAccountInfo(pool))!.data.readBigUInt64LE(FINISH_CURVE_TS_OFFSET)
  finding('finishCurveTimestamp@344(beforeComplete)', (await readFinishTs()).toString())

  // ---- H. DFS fund_by_claiming_fee(ClaimTradingFee2) before completion
  const tokenVault = deriveTokenVaultAddress(feeVault)
  const vaultBal = async () => BigInt((await conn.getTokenAccountBalance(tokenVault)).value.amount)
  const dfsClaimDbc = async (label: string, key: string) => {
    const before = await vaultBal()
    try {
      await send(label, await dfs.fundByClaimDbcPartnerTradingFee2({
        signer: creator.publicKey, feeClaimer: feeVault, feeVault, poolConfig: configKp.publicKey, virtualPool: pool,
      }), [creator])
      finding(key, (await vaultBal() - before).toString())
      return true
    } catch {
      finding(key, 'FAILED (see step logs)')
      return false
    }
  }
  const dfsDbcOk = await dfsClaimDbc('H. DFS fund_by_claiming_fee → DBC claim_trading_fee2 (fee vault PDA signs as feeClaimer)', 'dfsFundedFromDbcPartnerFee(lamports)')
  finding('dfsClaimTradingFee2Works', dfsDbcOk)

  // ---- H2. keeper fallback proof: separate small hook pool whose feeClaimer is a plain keypair
  {
    const kConfig = Keypair.generate()
    const kMint = Keypair.generate()
    const kPool = deriveDbcPoolAddress(NATIVE_MINT, kMint.publicKey, kConfig.publicKey)
    record.keys.keeperConfig = kConfig.publicKey.toBase58()
    record.keys.keeperPool = kPool.toBase58()
    const kCfgTx = await dbc.partner.createConfigWithTransferHook({
      config: kConfig.publicKey, feeClaimer: wallet.publicKey, leftoverReceiver: treasury, payer: wallet.publicKey,
      quoteMint: NATIVE_MINT, transferHookProgram: HOLDFAST, ...curve(tokenAuthority),
    })
    await send('H2a. keeper fallback: createConfigWithTransferHook (feeClaimer = keeper wallet)', kCfgTx, [wallet, kConfig])
    const kPoolTx = await dbc.creator.createPoolWithTransferHook({
      baseMint: kMint.publicKey, config: kConfig.publicKey, name: 'Holdfast Keeper Spike', symbol: 'HFKPR',
      uri: 'https://holdfast.example/spike.json', payer: wallet.publicKey, poolCreator: creator.publicKey, transferHookProgram: HOLDFAST,
    })
    kPoolTx.add(initExtraMetasIx(wallet.publicKey, kMint.publicKey))
    await send('H2b. keeper fallback: pool + meta list', kPoolTx, [wallet, kMint])
    const kBaseVault = (await dbc.state.getPool(kPool))!.poolState.baseVault
    const kBuy = await dbc.pool.swap2WithTransferHook({
      owner: buyer.publicKey, pool: kPool, swapBaseForQuote: false, referralTokenAccount: null,
      swapMode: SwapMode.ExactIn, amountIn: new BN(Math.round(0.02 * LAMPORTS_PER_SOL)), minimumAmountOut: new BN(0),
    })
    await patchHookAccounts(kBuy, kMint.publicKey, kBaseVault, getAssociatedTokenAddressSync(kMint.publicKey, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID), poolAuthority)
    await send('H2c. keeper fallback: buy', kBuy, [buyer])
    const before = await conn.getBalance(wallet.publicKey)
    const kClaim = await dbc.partner.claimPartnerTradingFee2({
      pool: kPool, feeClaimer: wallet.publicKey, payer: wallet.publicKey, maxBaseAmount: new BN(0), maxQuoteAmount: new BN('18446744073709551615'), receiver: wallet.publicKey,
    })
    const kSig = await send('H2d. keeper fallback: claimPartnerTradingFee2 by keeper keypair', kClaim, [wallet])
    const fee = (await conn.getTransaction(kSig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }))?.meta?.fee ?? 0
    finding('keeperClaimPartnerTradingFee2(lamports)', (await conn.getBalance(wallet.publicKey)) - before + fee)
  }

  // ---- I. push curve to completion
  const pushTx = await dbc.pool.swap2WithTransferHook({
    owner: buyer.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null,
    swapMode: SwapMode.PartialFill, amountIn: new BN(Math.round(MIGRATION_QUOTE_THRESHOLD_SOL * 1.5 * LAMPORTS_PER_SOL)), minimumAmountOut: new BN(0),
  })
  await patchHookAccounts(pushTx, mint, baseVault, buyerAta, poolAuthority)
  const pushSig = await send('I. buy that completes the curve (PartialFill)', pushTx, [buyer])
  finding('hookLogs(completingBuy)', hookLogs(await txLogs(pushSig)))
  const finishTs = await readFinishTs()
  const decoded = (await dbc.state.getPool(pool))!.poolState
  finding('finishCurveTimestamp@344(afterComplete)', { raw: finishTs.toString(), sdkDecoded: decoded.finishCurveTimestamp.toString(), match: finishTs.toString() === decoded.finishCurveTimestamp.toString() })
  const mintAfter = await getMint(conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const hookAfter = getTransferHook(mintAfter)
  finding('hookAfterCompletion', { programId: hookAfter?.programId.toBase58() ?? null, authority: hookAfter?.authority.toBase58() ?? null })

  // plain transfer without any hook accounts now works
  const plain = new Transaction().add(createTransferCheckedInstruction(buyerAta, mint, buyer2Ata, buyer.publicKey, 1_000_000n, 6, [], TOKEN_2022_PROGRAM_ID))
  await send('I2. plain transferChecked after completion (no hook accounts)', plain, [buyer])

  // claim the rest of the bonding fees into DFS before migration
  if (dfsDbcOk) await dfsClaimDbc('I3. DFS fund_by_claiming_fee → claim_trading_fee2 after completion', 'dfsFundedFromDbcPartnerFee#2(lamports)')

  // ---- J. migrate to DAMM v2 (Customizable → Compounding)
  const mig = await dbc.migration.migrateToDammV2({ payer: wallet.publicKey, pool, dammConfig })
  await send('J. migrateToDammV2 (dammConfig = Customizable)', mig.transaction, [wallet, mig.firstPositionNftKeypair, mig.secondPositionNftKeypair])
  const dammPool = deriveDammV2PoolAddress(dammConfig, mint, NATIVE_MINT)
  const dammState = await cpAmm.fetchPoolState(dammPool)
  record.keys.dammPool = dammPool.toBase58()
  finding('dammPool', {
    address: dammPool.toBase58(), collectFeeMode: dammState.collectFeeMode, tokenA: dammState.tokenAMint.toBase58(), tokenB: dammState.tokenBMint.toBase58(),
  })
  const vaultPositions = await cpAmm.getPositionsByUser(feeVault)
  const creatorPositions = await cpAmm.getPositionsByUser(creator.publicKey)
  finding('positionsOwnedByFeeVault', vaultPositions.map((p) => ({ position: p.position.toBase58(), nftAccount: p.positionNftAccount.toBase58(), permanentLocked: p.positionState.permanentLockedLiquidity.toString(), unlocked: p.positionState.unlockedLiquidity.toString() })))
  finding('positionsOwnedByCreator', creatorPositions.map((p) => ({ position: p.position.toBase58(), vested: p.positionState.vestedLiquidity.toString(), unlocked: p.positionState.unlockedLiquidity.toString() })))

  // ---- K. DAMM v2 swaps to generate LP fees, then DFS claim of the partner position fee
  for (const [i, aToB] of [[1, false], [2, true]] as const) {
    const inMint = aToB ? dammState.tokenAMint : dammState.tokenBMint
    const outMint = aToB ? dammState.tokenBMint : dammState.tokenAMint
    const amountIn = aToB
      ? new BN(((await getAccount(conn, buyerAta, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount / 2n).toString())
      : new BN(Math.round(0.05 * LAMPORTS_PER_SOL))
    const swapTx = await cpAmm.swap({
      payer: buyer.publicKey, pool: dammPool, inputTokenMint: inMint, outputTokenMint: outMint, amountIn, minimumAmountOut: new BN(0),
      tokenAMint: dammState.tokenAMint, tokenBMint: dammState.tokenBMint, tokenAVault: dammState.tokenAVault, tokenBVault: dammState.tokenBVault,
      tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
    })
    await send(`K${i}. DAMM v2 swap ${aToB ? 'base→SOL' : 'SOL→base'} (generate LP fees)`, swapTx, [buyer])
  }
  if (vaultPositions.length > 0) {
    const p = vaultPositions[0]
    const v2 = await vaultBal()
    const claimTx = await dfs.fundByClaimDammV2Fee({
      signer: creator.publicKey, owner: feeVault, feeVault, dammV2Position: p.position, dammV2PositionNftAccount: p.positionNftAccount, dammV2Pool: dammPool,
    })
    await send('K3. DFS fund_by_claiming_fee → DAMM v2 claim_position_fee (partner LP owned by fee vault PDA)', claimTx, [creator])
    finding('dfsFundedFromDammV2PositionFee(lamports)', (await vaultBal() - v2).toString())
  }

  // ---- L. DFS shareholder claim (creator, index 1)
  const claimUser = await dfs.claimUserFee({ feeVault, user: creator.publicKey, payer: creator.publicKey })
  await send('L. DFS claim_fee by shareholder (creator)', claimUser, [creator])

  const spent = (startBalance - (await conn.getBalance(wallet.publicKey))) / LAMPORTS_PER_SOL
  finding('walletSolSpent', spent)
  console.log(`\nwritten ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  save()
  process.exit(1)
})
