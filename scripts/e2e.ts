/**
 * Phase 2 end-to-end run (DESIGN.md §10 Phase 2 DoD): one launch through bonding, protection
 * rules, graduation, migration and two rounds of holder rewards. Keeper fee mode (devnet DFS can't
 * claim DBC fees from hook pools — docs/VERIFICATION.md V6); `MODE=dfs` on localnet/mainnet bins.
 *
 *   RPC_URL=https://api.devnet.solana.com pnpm e2e      → docs/e2e/devnet.json + docs/e2e/devnet.md
 *   pnpm e2e                                           → localnet (scripts/local-validator.sh running)
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, MigrationFeeOption, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk'
import BN from 'bn.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DFS_SHARES, IS_LOCALNET, SUPPLY, RPC_URL, TxResult, balanceOf, bn, buy, claimIxs, clockNow, conn, createLaunch, dbc,
  depositRewardsIxs, expectError, fetchHolder, fetchLaunch, finalizeIx, newActor, send, sell, tokenBalance, transfer,
  waitUntil, wallet, wsolAta,
} from '../tests/helpers'

const CLUSTER = IS_LOCALNET ? 'localnet' : RPC_URL.includes('devnet') ? 'devnet' : 'other'
if (RPC_URL.includes('mainnet')) throw new Error('e2e refuses to run on mainnet')
const explorer = (sig: string) =>
  CLUSTER === 'devnet' ? `https://explorer.solana.com/tx/${sig}?cluster=devnet` : sig

type Row = { step: string; sig?: string; note?: string }
const rows: Row[] = []
const facts: Record<string, unknown> = {}
const log = (step: string, r?: TxResult | string, note?: string) => {
  const sig = typeof r === 'string' ? r : r?.sig
  rows.push({ step, sig, note })
  console.log(`✔ ${step}${sig ? `  ${sig}` : ''}${note ? `  (${note})` : ''}`)
}
/** `p` percent of total supply in base units */
const pct = (p: number) => (SUPPLY * BigInt(Math.round(p * 100))) / 10_000n
const sol = (lamports: bigint | number) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)

function writeRecord(error?: string) {
  const outDir = join(__dirname, '..', 'docs', 'e2e')
  mkdirSync(outDir, { recursive: true })
  if (error) facts.error = error
  writeFileSync(join(outDir, `${CLUSTER}.json`), JSON.stringify({ cluster: CLUSTER, at: new Date().toISOString(), facts, rows }, null, 2))
  const md = [
    `# Phase 2 end-to-end run (${CLUSTER})`, '',
    `Run at ${new Date().toISOString()} by \`scripts/e2e.ts\` (keeper fee mode). Program \`E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw\`.`, '',
    '| # | Step | Tx | Note |', '|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r.step} | ${r.sig ? (CLUSTER === 'devnet' ? `[${r.sig.slice(0, 8)}…](${explorer(r.sig)})` : `\`${r.sig.slice(0, 8)}…\``) : 'simulated'} | ${r.note ?? ''} |`),
    '', '## Facts', '', ...Object.entries(facts).map(([k, v]) => `- ${k}: \`${String(v)}\``), '',
  ].join('\n')
  writeFileSync(join(outDir, `${CLUSTER}.md`), md)
}

async function main() {
  const start = await conn.getBalance(wallet.publicKey)
  console.log(`cluster=${CLUSTER} wallet=${wallet.publicKey.toBase58()} balance=${sol(start)} SOL`)
  const threshold = Number(process.env.THRESHOLD_SOL ?? 0.2)
  // generous window/lock: each devnet tx takes a few seconds to confirm
  const windowSecs = Number(process.env.WINDOW_SECS ?? 60)
  const snipeLockSecs = Number(process.env.LOCK_SECS ?? 60)

  // Actors: alice (early, holds), bob (holds), flipper (buys after the window, sells), closer.
  const [alice, bob, flipper, closer] = await Promise.all([
    newActor(0.02), newActor(0.02), newActor(0.03), newActor(threshold * 1.3 + 0.05),
  ])
  // keep the actors' keys (gitignored) so a failed devnet run can be resumed by hand
  const keysDir = join(__dirname, '.e2e-keys')
  mkdirSync(keysDir, { recursive: true })
  writeFileSync(join(keysDir, `${CLUSTER}-${Date.now()}.json`), JSON.stringify(
    Object.fromEntries(Object.entries({ alice, bob, flipper, closer }).map(([k, v]) => [k, Array.from(v.secretKey)]))))

  // ---- Launch: Arena-like rules, short so the run fits in a couple of minutes
  const l = await createLaunch({ windowSecs, snipeLockSecs, maxWalletBps: 300, thresholdSol: threshold, mode: 'keeper' })
  facts.mint = l.mint.toBase58()
  facts.pool = l.pool.toBase58()
  facts.launch = l.launch.toBase58()
  log('§6.1 launch: DBC hook config, then pool + init_launch + creator register in one tx', l.createSig, `window ${windowSecs} s, lock ${snipeLockSecs} s, max wallet 3%, threshold ${threshold} SOL`)

  // ---- Opening window
  log('alice registers + buys 1.5% of supply in the window', await buy(l, alice, 0.01, { register: true, tokensOut: pct(1.5) }))
  log('bob registers + buys 1% of supply in the window', await buy(l, bob, 0.01, { register: true, tokensOut: pct(1) }))
  const aliceBal = await balanceOf(l.mint, alice.publicKey)
  await expectError(() => sell(l, alice, aliceBal / 2n), 'SnipeLocked')
  log('alice tries to dump inside her lock → rejected (simulation)', undefined, 'SnipeLocked')
  await expectError(() => buy(l, flipper, 0.01), 'RecipientNotRegistered')
  log('unregistered wallet tries to buy in the window → rejected (simulation)', undefined, 'RecipientNotRegistered')
  await expectError(() => buy(l, bob, 0.01, { tokensOut: pct(2.5) }), 'MaxWalletExceeded')
  log('bob tries to go above 3% of supply in the window → rejected (simulation)', undefined, 'MaxWalletExceeded')

  // ---- After window + lock: free trading
  const launch0 = await fetchLaunch(l.mint)
  await waitUntil(launch0.launchTs.toNumber() + launch0.windowSecs + launch0.snipeLockSecs)
  log('flipper buys after the window (unregistered → untracked)', await buy(l, flipper, 0.02))
  log('flipper sells everything', await sell(l, flipper, await balanceOf(l.mint, flipper.publicKey)))
  log('bob sends 30% to a fresh wallet (forfeits 30% of his points)',
    await transfer(l.mint, bob, Keypair.generate().publicKey, ((await balanceOf(l.mint, bob.publicKey)) * 3n) / 10n))

  // ---- Graduation
  await waitUntil((await clockNow()) + 3)
  log('closer completes the curve (DBC revokes the hook)', await buy(l, closer, threshold * 1.3, { partialFill: true }))
  log('finalize: conviction frozen at finishCurveTimestamp', await send([await finalizeIx(l)], [wallet]))
  const fin = await fetchLaunch(l.mint)
  facts.finalTs = fin.finalTs.toNumber()
  facts.finalTotalPoints = fin.finalTotalPoints.toString()

  // ---- Round 1: bonding fees (keeper claims partner fee, deposits the holders' 60%)
  // claimable partner quote fee, read from the pool before claiming (balance deltas are polluted by ATA rent)
  const partnerFee = bn((await dbc.state.getPool(l.pool))!.poolState.partnerQuoteFee)
  const claimRes = await send(await dbc.partner.claimPartnerTradingFee2({
    pool: l.pool, feeClaimer: wallet.publicKey, payer: wallet.publicKey, maxBaseAmount: new BN(0),
    maxQuoteAmount: new BN('18446744073709551615'), receiver: wallet.publicKey,
  }), [wallet])
  log('keeper: claimPartnerTradingFee2 (DBC bonding fees)', claimRes, `${sol(partnerFee)} SOL`)
  const share1 = (partnerFee * BigInt(DFS_SHARES.holders)) / 100n
  log("keeper: deposit_rewards (holders' 60%)", await send(await depositRewardsIxs(l, wallet.publicKey, share1), [wallet]), `${sol(share1)} SOL`)

  const claims: Record<string, bigint> = {}
  for (const [name, who] of [['alice', alice], ['bob', bob]] as const) {
    const b0 = await tokenBalance(wsolAta(who.publicKey))
    const r = await send(await claimIxs(l, who.publicKey), [who])
    claims[name] = (await tokenBalance(wsolAta(who.publicKey))) - b0
    log(`${name} claims (round 1)`, r, `${sol(claims[name])} SOL`)
  }

  // ---- Migration + round 2: DAMM v2 LP fees (the keeper owns the partner LP position in keeper mode)
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]
  const mig = await dbc.migration.migrateToDammV2({ payer: wallet.publicKey, pool: l.pool, dammConfig })
  log('migrateToDammV2 (Compounding pool)', await send(mig.transaction, [wallet, mig.firstPositionNftKeypair, mig.secondPositionNftKeypair]))
  const cpAmm = new CpAmm(conn)
  const dammPool = deriveDammV2PoolAddress(dammConfig, l.mint, NATIVE_MINT)
  const state = await cpAmm.fetchPoolState(dammPool)
  facts.dammPool = dammPool.toBase58()
  facts.dammCollectFeeMode = state.collectFeeMode
  const swap = (input: PublicKey, output: PublicKey, amountIn: BN) => cpAmm.swap({
    payer: closer.publicKey, pool: dammPool, inputTokenMint: input, outputTokenMint: output, amountIn, minimumAmountOut: new BN(0),
    tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
    tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null,
  })
  log('post-graduation trade on DAMM v2 (closer sells half)',
    await send(await swap(l.mint, NATIVE_MINT, new BN(((await balanceOf(l.mint, closer.publicKey)) / 2n).toString())), [closer]))

  // the keeper may own positions in other pools (e.g. earlier runs): pick this pool's
  const position = (await cpAmm.getPositionsByUser(wallet.publicKey)).find((p) => p.positionState.pool.equals(dammPool))
  if (!position) throw new Error('keeper has no position in the migrated pool')
  // quote-side (token B) LP fee owed to the position, read before claiming
  const lpFee = bn(getUnClaimLpFee(await cpAmm.fetchPoolState(dammPool), position.positionState).feeTokenB)
  const lp = await send(await cpAmm.claimPositionFee2({
    owner: wallet.publicKey, position: position.position, pool: dammPool, positionNftAccount: position.positionNftAccount,
    tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
    tokenAProgram: TOKEN_2022_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, receiver: wallet.publicKey,
  }), [wallet])
  log('keeper: claim partner LP fee (DAMM v2 claim_position_fee)', lp, `${sol(lpFee)} SOL (quote side)`)
  facts.partnerLpFeeLamports = lpFee.toString()
  const share2 = (lpFee * BigInt(DFS_SHARES.holders)) / 100n
  if (share2 > 0n) {
    log("keeper: deposit_rewards (holders' 60% of LP fees)", await send(await depositRewardsIxs(l, wallet.publicKey, share2), [wallet]), `${sol(share2)} SOL`)
    for (const [name, who] of [['alice', alice], ['bob', bob]] as const) {
      const b0 = await tokenBalance(wsolAta(who.publicKey))
      const r = await send(await claimIxs(l, who.publicKey), [who])
      const got = (await tokenBalance(wsolAta(who.publicKey))) - b0
      claims[name] += got
      log(`${name} claims again (round 2, post-graduation)`, r, `${sol(got)} SOL`)
    }
  } else {
    log('round 2 skipped: no quote-side LP fee accrued to the partner position yet')
  }

  // ---- Summary
  const finalLaunch = await fetchLaunch(l.mint)
  const [ha, hb] = await Promise.all([fetchHolder(l.mint, alice.publicKey), fetchHolder(l.mint, bob.publicKey)])
  Object.assign(facts, {
    aliceFinalPoints: ha!.finalPoints.toString(), bobFinalPoints: hb!.finalPoints.toString(),
    aliceClaimedLamports: claims.alice.toString(), bobClaimedLamports: claims.bob.toString(),
    totalRewardsIn: bn(finalLaunch.totalRewardsIn).toString(), totalRewardsClaimed: bn(finalLaunch.totalRewardsClaimed).toString(),
    walletSolSpent: sol(start - (await conn.getBalance(wallet.publicKey))),
  })
  if (claims.alice <= 0n || claims.bob <= 0n) throw new Error('expected non-zero claims')

  writeRecord()
  console.log(`\nalice claimed ${sol(claims.alice)} SOL, bob claimed ${sol(claims.bob)} SOL → docs/e2e/${CLUSTER}.md`)
}

main().catch((e) => {
  console.error(e)
  writeRecord(String((e as Error).message ?? e).split('\n')[0])
  process.exit(1)
})
