/**
 * The Arena (DESIGN.md §8): one Arena-preset launch, bot personas on a timeline, graduation,
 * migration, two rounds of holder rewards, and a "who got paid?" summary.
 *
 *   pnpm -C sim fund                 # once: create + fund bots
 *   pnpm -C sim arena [--speed 0.6]    # → sim/out/events.jsonl, sim/out/summary.json
 *   pnpm -C sim sweep                # return leftover bot SOL
 *
 * Uses only @holdfast/sdk. --speed scales the timeline AND the launch's window / lock / fee decay,
 * so a 0.6 run tells the same story in ~60% of the time.
 */
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  type FeeMode,
  TOTAL_SUPPLY,
  buy,
  claim,
  claimable,
  crank,
  createLaunch,
  defaultFeeMode,
  getHolderForOwner,
  getLaunch,
  getLeaderboard,
  migrate,
  presets,
  sell,
  sendSteps,
  swapGraduated,
} from '@holdfast/sdk'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  type Bot, NETWORK, OUT_DIR, type Persona, attempt, conn, elapsed, emit, explorer, loadBots, resetEvents, rng, rpcCalls, send, sleep,
  sleepUntil, sol, startClock, tokenBalance, tradeSolDelta, wallet,
} from './lib'

const { values: args } = parseArgs({
  options: {
    speed: { type: 'string', default: '1' },
    seed: { type: 'string', default: '7' },
    'fee-mode': { type: 'string' },
  },
})
const S = Number(args.speed)
const T = (secs: number) => secs * S
const rand = rng(Number(args.seed))
const pct = (p: number) => (TOTAL_SUPPLY * BigInt(Math.round(p * 100))) / 10_000n
const tokens = (base: bigint) => Number(base / 1_000_000n)
const SLIPPAGE = 2500 // the opening crush moves the price a lot between quote and execution; bots accept 25%

// per-persona ledger
type Ledger = { invested: number; proceeds: number; rewards: number; blocked: Record<string, number> }
const ledger = new Map<string, Ledger>() // bot name → ledger
const L = (b: Bot) => {
  if (!ledger.has(b.name)) ledger.set(b.name, { invested: 0, proceeds: 0, rewards: 0, blocked: {} })
  return ledger.get(b.name)!
}
const keyTxs: Record<string, string> = {}

let mint: PublicKey

// Trades are recorded now and priced after the run (fetching each tx inside the opening window
// would cost RPC calls the bots need).
const trades: { bot: Bot; sig: string; side: 'buy' | 'sell' }[] = []
const registered = new Set<string>()

async function doBuy(b: Bot, what: string, p: { solIn: number; tokensOut?: bigint; partialFill?: boolean; autoRegister?: boolean }) {
  const first = !registered.has(b.name)
  const r = await attempt(b, what, () =>
    buy(conn, { owner: b.kp.publicKey, mint, slippageBps: SLIPPAGE, autoRegister: p.autoRegister ?? first, ...p }),
  )
  if (!r.ok) {
    if (r.reason) L(b).blocked[r.reason] = (L(b).blocked[r.reason] ?? 0) + 1
    return r
  }
  if (p.autoRegister !== false) registered.add(b.name)
  trades.push({ bot: b, sig: r.sig, side: 'buy' })
  const size = p.tokensOut !== undefined ? `${(Number(p.tokensOut) / Number(TOTAL_SUPPLY) * 100).toFixed(1)}% of supply` : `${p.solIn} SOL`
  emit({ kind: 'buy', persona: b.persona, bot: b.name, sol: p.tokensOut === undefined && !p.partialFill ? p.solIn : undefined, message: `${what}: bought ${size}${first ? ' (registered on first buy)' : ''}`, sig: r.sig })
  return r
}

async function doSellAll(b: Bot, what: string) {
  const amount = await tokenBalance(mint, b.kp.publicKey)
  if (amount === 0n) return { ok: true as const, sig: '' }
  const r = await attempt(b, what, () => sell(conn, { owner: b.kp.publicKey, mint, tokensIn: amount, slippageBps: SLIPPAGE }))
  if (!r.ok) {
    if (r.reason) L(b).blocked[r.reason] = (L(b).blocked[r.reason] ?? 0) + 1
    return r
  }
  trades.push({ bot: b, sig: r.sig, side: 'sell' })
  emit({ kind: 'sell', persona: b.persona, bot: b.name, tokens: tokens(amount), message: `${what}: sold everything${registered.has(b.name) ? ', forfeiting all its conviction points' : ''}`, sig: r.sig })
  return r
}

/** Prices every recorded trade from its confirmed transaction (after the run). */
async function settleTrades() {
  for (const t of trades) {
    const delta = await tradeSolDelta(t.sig, t.bot.kp.publicKey).catch((e) => {
      console.warn(`  (could not price ${t.side} by ${t.bot.name}: ${(e as Error).message})`)
      return 0
    })
    if (t.side === 'buy') L(t.bot).invested += delta
    else L(t.bot).proceeds += -delta
  }
}

// ---------------------------------------------------------------------------------------------
// Personas

async function sniper(b: Bot, window: number, lock: number) {
  await sleepUntil(T(2) + rand())
  await doBuy(b, 'snipes the open', { solIn: 0.25, tokensOut: pct(2.5) }) // max-wallet caps a sniper at 3%
  await sleepUntil(T(15))
  // dump attempts every 10 s until the lock lets go
  for (;;) {
    const r = await doSellAll(b, 'tries to dump')
    if (r.ok || r.reason !== 'SnipeLocked') return
    if (elapsed() > window + lock + 60) return
    await sleep(T(10) * 1000)
  }
}

async function bundler(b: Bot, bundle: Bot[]) {
  await sleepUntil(T(5))
  emit({ kind: 'phase', persona: 'bundler', bot: b.name, message: `bundler sprays buys across ${bundle.length} fresh wallets` })
  await Promise.all(bundle.map((w) => doBuy(w, 'bundled buy into a fresh wallet', { solIn: 0.01, autoRegister: false })))
}

async function whale(b: Bot, window: number) {
  await sleepUntil(T(8))
  await doBuy(b, 'tries to take 8% in the window', { solIn: 0.9, tokensOut: pct(8) })
  await sleepUntil(window + T(3))
  await doBuy(b, 'buys 8% after the window', { solIn: 0.9, tokensOut: pct(8) })
}

async function holder(b: Bot, i: number) {
  for (const at of [T(4 + i * 2), T(70 + i * 4), T(130 + i * 3)]) {
    await sleepUntil(at + rand())
    await doBuy(b, 'adds a small clip', { solIn: 0.02 })
  }
}

async function flipper(b: Bot, i: number, window: number) {
  await sleepUntil(window + T(5 + i * 8) + rand())
  const r = await doBuy(b, 'buys after the window', { solIn: 0.06 })
  if (!r.ok) return
  await sleep(T(30 + rand() * 60) * 1000)
  await doSellAll(b, 'flips')
}

async function closer(b: Bot) {
  // PartialFill stops at the end of the curve, so it only spends what completion needs
  const r = await doBuy(b, 'pushes the curve to completion', { solIn: 2.5, partialFill: true })
  if (!r.ok) throw new Error(`the closer could not complete the curve: ${r.message}`)
  keyTxs.graduation = r.sig
}

// ---------------------------------------------------------------------------------------------

async function sendLogged(kind: 'finalize' | 'deposit' | 'migrate' | 'swap', message: string, build: () => Promise<Transaction>, signers = [wallet]) {
  const sig = await send(build, signers)
  emit({ kind, message, sig })
  return sig
}

async function crankAll(label: string) {
  const wasFinal = (await getLaunch(conn, mint))!.finalized
  const txs = await crank(conn, { mint, signer: wallet.publicKey, holdersPct: presets.arena.split.holders })
  for (const [i, tx] of txs.entries()) {
    const isFinalize = !wasFinal && i === 0 // crank puts finalize first when it's due
    const sig = await sendLogged(
      isFinalize ? 'finalize' : 'deposit',
      isFinalize ? 'finalize: conviction frozen at graduation' : `${label}: crank step ${i + 1}/${txs.length} (fees → holders)`,
      async () => tx,
    )
    keyTxs[isFinalize ? 'finalize' : label] ??= sig
  }
}

async function claimRound(bots: Bot[], round: number) {
  const launch = (await getLaunch(conn, mint))!
  let paid = 0
  for (const b of bots) {
    const h = await getHolderForOwner(conn, mint, b.kp.publicKey)
    if (!h) continue
    const owed = Number(claimable(h, launch))
    if (owed === 0) continue
    const sig = await send(() => claim(conn, { owner: b.kp.publicKey, mint }), [b.kp])
    L(b).rewards += owed
    paid += owed
    emit({ kind: 'claim', persona: b.persona, bot: b.name, sol: sol(owed), message: `claims ${sol(owed).toFixed(6)} SOL (round ${round})`, sig })
    keyTxs[`claim-${round}`] ??= sig
  }
  return paid
}

async function main() {
  const bots = loadBots()
  const by = (p: Persona) => bots.filter((b) => b.persona === p)
  const feeMode = (args['fee-mode'] as FeeMode | undefined) ?? (NETWORK === 'localnet' ? 'keeper' : defaultFeeMode(NETWORK))
  const windowSecs = Math.round(presets.arena.rules.windowSecs * S)
  const snipeLockSecs = Math.round(presets.arena.rules.snipeLockSecs * S)

  resetEvents()
  console.log(`Arena on ${NETWORK} · speed ${S} · window ${windowSecs}s · lock ${snipeLockSecs}s · ${feeMode} fee mode · ${bots.length} bots\n`)
  const prepared = await createLaunch(conn, {
    creator: wallet.publicKey, name: 'Holdfast Arena', symbol: 'ARENA', uri: 'https://holdfast.example/arena.json',
    preset: 'arena', network: NETWORK, treasury: wallet.publicKey, feeMode, keeper: wallet.publicKey,
    overrides: { rules: { windowSecs, snipeLockSecs }, fee: { durationSecs: Math.max(10, Math.round(30 * S)) } },
  })
  mint = prepared.mint
  const sigs = await sendSteps(conn, prepared.steps, [wallet])
  keyTxs.launch = sigs[sigs.length - 1]
  startClock()
  const launch0 = (await getLaunch(conn, mint))!
  // align t=0 with the on-chain launch_ts
  const skew = Date.now() / 1000 - launch0.launchTs.toNumber()
  const window = windowSecs - skew
  const lock = snipeLockSecs
  writeFileSync(join(OUT_DIR, 'arena.json'), JSON.stringify({
    network: NETWORK, mint: mint.toBase58(), pool: prepared.pool.toBase58(), launch: prepared.launch.toBase58(), feeMode,
    launchTs: launch0.launchTs.toNumber(), windowSecs, snipeLockSecs, maxWalletBps: launch0.maxWalletBps, speed: S,
  }, null, 2))
  emit({ kind: 'launch', message: `Arena launched: window ${windowSecs}s, snipe-lock ${snipeLockSecs}s, max wallet 3%. Mint ${mint.toBase58()}`, sig: keyTxs.launch })

  // ---- bonding phase: everyone at once
  const crowd = [
    ...by('sniper').map((b) => sniper(b, window, lock)),
    bundler(by('bundler')[0], by('bundle')),
    whale(by('whale')[0], window),
    ...by('holder').map((b, i) => holder(b, i)),
    ...by('flipper').map((b, i) => flipper(b, i, window)),
  ]
  await Promise.all(crowd)
  await sleepUntil(window + lock + T(10))
  emit({ kind: 'phase', message: 'protection over: from here the hook cannot reject anything' })
  const board = await getLeaderboard(conn, mint, 5)
  emit({ kind: 'phase', message: `leaderboard before graduation: ${board.map((r) => `${bots.find((b) => b.kp.publicKey.equals(r.owner))?.name ?? 'creator'} ${(r.share * 100).toFixed(1)}%`).join(' · ')}` })

  // ---- graduation
  await closer(by('closer')[0])
  emit({ kind: 'graduate', message: 'curve complete: DBC revoked the hook; the token is now a plain Token-2022 token' })
  await crankAll('bonding fees')
  const mig = await migrate(conn, { mint, payer: wallet.publicKey })
  keyTxs.migrate = await sendLogged('migrate', 'migrated to a DAMM v2 pool (Compounding fees, partner LP locked forever)', async () => mig.tx, [wallet, ...mig.signers])
  const paid1 = await claimRound(bots, 1)

  // ---- after graduation: trading on DAMM v2 keeps paying holders
  const c = by('closer')[0]
  const half = (await tokenBalance(mint, c.kp.publicKey)) / 2n
  await sendLogged('swap', 'closer sells half on DAMM v2', () => swapGraduated(conn, { owner: c.kp.publicKey, mint, tokensIn: half, slippageBps: SLIPPAGE }), [c.kp])
  await sendLogged('swap', 'closer buys back 0.5 SOL on DAMM v2', () => swapGraduated(conn, { owner: c.kp.publicKey, mint, solIn: 0.5, slippageBps: SLIPPAGE }), [c.kp])
  await crankAll('LP fees')
  const paid2 = await claimRound(bots, 2)

  // ---- summary
  await settleTrades()
  const personas: Persona[] = ['holder', 'whale', 'sniper', 'flipper', 'bundler', 'closer']
  const rows = personas.map((p) => {
    const members = p === 'bundler' ? [...by('bundler'), ...by('bundle')] : by(p)
    const ls = members.map(L)
    const invested = ls.reduce((s, x) => s + x.invested, 0)
    const rewards = ls.reduce((s, x) => s + x.rewards, 0)
    const blocked: Record<string, number> = {}
    for (const x of ls) for (const [k, v] of Object.entries(x.blocked)) blocked[k] = (blocked[k] ?? 0) + v
    return {
      persona: p, bots: members.length, investedSol: sol(invested), proceedsSol: sol(ls.reduce((s, x) => s + x.proceeds, 0)),
      rewardsSol: sol(rewards), rewardsPerSol: invested > 0 ? rewards / invested : 0, blocked,
    }
  })
  const per = Object.fromEntries(rows.map((r) => [r.persona, r.rewardsPerSol]))
  const ratio = (a: number, b: number) => (b === 0 ? (a > 0 ? 'infinite' : 'n/a') : Number((a / b).toFixed(2)))
  const others = Math.max(per.flipper, per.sniper)
  const summary = {
    network: NETWORK, mint: mint.toBase58(), speed: S, durationSecs: Math.round(elapsed()), rpcCalls,
    rewardsPaidSol: { round1BondingFees: sol(paid1), round2LpFees: sol(paid2) },
    personas: rows,
    holdersVsFlippers: ratio(per.holder, per.flipper),
    holdersVsSnipers: ratio(per.holder, per.sniper),
    successMetric: { rule: "holders' rewards per SOL ≥ 5× flippers' and snipers'", met: per.holder > 0 && per.holder >= 5 * others },
    blockedTotal: rows.reduce((s, r) => s + Object.values(r.blocked).reduce((a, b) => a + b, 0), 0),
    keyTxs: Object.fromEntries(Object.entries(keyTxs).map(([k, v]) => [k, explorer('tx', v)])),
    explorer: explorer('address', mint.toBase58()),
  }
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  emit({ kind: 'phase', message: `done: holders earned ${per.holder > 0 ? (per.holder * 1e3).toFixed(3) : 0} mSOL per SOL; flippers ${(per.flipper * 1e3).toFixed(3)}; snipers ${(per.sniper * 1e3).toFixed(3)}` })
  console.log('\n' + JSON.stringify({ personas: rows.map((r) => ({ [r.persona]: `${r.rewardsPerSol.toExponential(3)} reward/SOL, blocked ${JSON.stringify(r.blocked)}` })), metric: summary.successMetric }, null, 2))
  if (!summary.successMetric.met) process.exitCode = 2
}

main().catch((e) => {
  emit({ kind: 'error', message: String((e as Error).message ?? e).split('\n')[0] })
  console.error(e)
  process.exit(1)
})
