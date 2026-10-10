/** Shared Arena plumbing: connection, bots, event log, sending with retries, SOL accounting. */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token'
import { explainError, holdfastErrorName, holderTokenAccount, requiredSigners } from '@holdfast/sdk'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
export const NETWORK = RPC_URL.includes('mainnet') ? 'mainnet' : RPC_URL.includes('devnet') ? 'devnet' : 'localnet'
if (NETWORK === 'mainnet') throw new Error('The Arena refuses to run on mainnet')
/**
 * Public devnet RPC allows ~100 requests / 10 s per IP. Every SDK call goes through this connection,
 * so pacing its fetch keeps 27 bots under the limit. RPC_RPS overrides (e.g. for a paid endpoint).
 */
const RPS = Number(process.env.RPC_RPS ?? (NETWORK === 'localnet' ? 1000 : 9))
const BURST = Number(process.env.RPC_BURST ?? 15)
let tokens = BURST
let refilled = Date.now()
export let rpcCalls = 0
// Public RPC also caps new connections per IP (~40 / 10 s): few requests in flight → keep-alive sockets get reused.
const MAX_IN_FLIGHT = Number(process.env.RPC_IN_FLIGHT ?? (NETWORK === 'localnet' ? 64 : 4))
let inFlight = 0
const waiters: (() => void)[] = []
/** Token bucket (up to BURST at once, refilled at RPS/s) plus an in-flight cap. */
const pacedFetch: typeof fetch = async (input, init) => {
  while (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiters.push(r))
  inFlight++
  try {
    return await rateLimited(input, init)
  } finally {
    inFlight--
    waiters.shift()?.()
  }
}
const rateLimited: typeof fetch = async (input, init) => {
  for (;;) {
    const now = Date.now()
    tokens = Math.min(BURST, tokens + ((now - refilled) / 1000) * RPS)
    refilled = now
    if (tokens >= 1) break
    await new Promise((r) => setTimeout(r, ((1 - tokens) / RPS) * 1000))
  }
  tokens -= 1
  rpcCalls++
  return fetch(input, init)
}
export const conn = new Connection(RPC_URL, { commitment: 'confirmed', fetch: pacedFetch })
export const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? join(homedir(), '.config/solana/id.json'), 'utf8'))),
)
export const SIM_DIR = join(__dirname, '..')
export const OUT_DIR = join(SIM_DIR, 'out')
export const KEYS_FILE = join(SIM_DIR, '.keys', `bots-${NETWORK}.json`)
export const explorer = (kind: 'tx' | 'address', id: string) =>
  NETWORK === 'devnet' ? `https://explorer.solana.com/${kind}/${id}?cluster=devnet` : id
export const sol = (lamports: number | bigint) => Number(lamports) / LAMPORTS_PER_SOL

// ---------------------------------------------------------------------------------------------
// Roster (DESIGN.md §8)
export type Persona = 'sniper' | 'bundler' | 'bundle' | 'whale' | 'flipper' | 'holder' | 'closer'
export const ROSTER: { persona: Persona; count: number; fundSol: number }[] = [
  { persona: 'sniper', count: 3, fundSol: 0.3 },
  { persona: 'bundler', count: 1, fundSol: 0.01 },
  { persona: 'bundle', count: 5, fundSol: 0.03 }, // the bundler's fresh, unregistered wallets
  { persona: 'whale', count: 1, fundSol: 1.0 },
  { persona: 'flipper', count: 6, fundSol: 0.15 },
  { persona: 'holder', count: 10, fundSol: 0.15 },
  { persona: 'closer', count: 1, fundSol: 3.0 },
]
export type Bot = { persona: Persona; name: string; kp: Keypair }

export function loadBots(): Bot[] {
  if (!existsSync(KEYS_FILE)) throw new Error(`No bots for ${NETWORK}: run \`pnpm -C sim fund\` first`)
  const raw = JSON.parse(readFileSync(KEYS_FILE, 'utf8')) as { persona: Persona; name: string; secretKey: number[] }[]
  return raw.map((b) => ({ persona: b.persona, name: b.name, kp: Keypair.fromSecretKey(Uint8Array.from(b.secretKey)) }))
}

export function saveBots(bots: Bot[]) {
  mkdirSync(dirname(KEYS_FILE), { recursive: true })
  writeFileSync(KEYS_FILE, JSON.stringify(bots.map((b) => ({ persona: b.persona, name: b.name, secretKey: Array.from(b.kp.secretKey) }))))
}

// ---------------------------------------------------------------------------------------------
// Event log (sim/out/events.jsonl → the web app's /arena feed)
export type EventKind =
  | 'phase' | 'launch' | 'buy' | 'sell' | 'transfer' | 'blocked' | 'graduate' | 'finalize' | 'migrate'
  | 'deposit' | 'claim' | 'swap' | 'error'
export type ArenaEvent = {
  t: number // seconds since launch
  ts: number // unix ms
  kind: EventKind
  persona?: Persona
  bot?: string
  sol?: number
  tokens?: number // whole tokens
  reason?: string // blocked: the Holdfast error name
  message: string
  sig?: string
}

const EVENTS = join(OUT_DIR, 'events.jsonl')
let t0 = Date.now()
export function startClock() {
  t0 = Date.now()
}
export const elapsed = () => (Date.now() - t0) / 1000

export function resetEvents() {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(EVENTS, '')
}

export function emit(e: Omit<ArenaEvent, 't' | 'ts'>) {
  const ev: ArenaEvent = { t: Math.round(elapsed() * 10) / 10, ts: Date.now(), ...e }
  appendFileSync(EVENTS, JSON.stringify(ev) + '\n')
  const icon = { blocked: '✋', error: '✘', phase: '▶' }[ev.kind as string] ?? '·'
  console.log(`${ev.t.toFixed(1).padStart(6)}s ${icon} ${ev.bot ? ev.bot.padEnd(10) : ''.padEnd(10)} ${ev.message}`)
}

// ---------------------------------------------------------------------------------------------
// Sending
const TRANSIENT = /blockhash not found|block height exceeded|429|Too Many Requests|fetch failed|ECONNRESET|timed out|Timeout|socket hang up|503|502/i

// One shared blockhash and ONE batched status poll for every pending tx: web3.js's
// sendAndConfirmTransaction polls block height per tx, which burns the public RPC budget.
let cachedBlockhash: { blockhash: string; at: number } | undefined
async function recentBlockhash() {
  if (!cachedBlockhash || Date.now() - cachedBlockhash.at > 20_000) {
    cachedBlockhash = { blockhash: (await conn.getLatestBlockhash('confirmed')).blockhash, at: Date.now() }
  }
  return cachedBlockhash.blockhash
}

type Pending = { resolve: () => void; reject: (e: Error) => void; sentAt: number }
const pending = new Map<string, Pending>()
let confirmer: NodeJS.Timeout | undefined
function watch(sig: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pending.set(sig, { resolve, reject, sentAt: Date.now() })
    confirmer ??= setInterval(pollStatuses, 1500)
  })
}
async function pollStatuses() {
  if (pending.size === 0) {
    clearInterval(confirmer)
    confirmer = undefined
    return
  }
  const sigs = [...pending.keys()].slice(0, 256)
  try {
    const { value } = await conn.getSignatureStatuses(sigs)
    value.forEach((st, i) => {
      const p = pending.get(sigs[i])!
      if (st?.err) {
        pending.delete(sigs[i])
        p.reject(new Error(`transaction ${sigs[i]} failed on-chain: ${JSON.stringify(st.err)}`))
      } else if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') {
        pending.delete(sigs[i])
        p.resolve()
      } else if (Date.now() - p.sentAt > 60_000) {
        pending.delete(sigs[i])
        p.reject(new Error(`transaction ${sigs[i]} timed out (block height exceeded)`))
      }
    })
  } catch {
    // transient: try again next tick
  }
}

/** Sign, send with preflight (Holdfast rejections surface here, with logs), then await batched confirmation. */
async function sendOnce(tx: Transaction, signers: Keypair[]): Promise<string> {
  tx.feePayer ??= signers[0].publicKey
  tx.recentBlockhash = await recentBlockhash()
  tx.sign(...requiredSigners(tx, signers))
  const sig = bs58.encode(tx.signature!)
  try {
    await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: 'confirmed', maxRetries: 3 })
  } catch (e) {
    // an earlier attempt with identical bytes already landed: just confirm it
    if (!/already been processed/i.test(String((e as Error).message ?? e))) throw e
  }
  await watch(sig)
  return sig
}

/** Sends with retries on transient network errors. Program errors are thrown at once (preflight: no SOL spent). */
export async function send(build: () => Promise<Transaction>, signers: Keypair[], tries = 4): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      return await sendOnce(await build(), signers)
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      const transient = !holdfastErrorName(e) && TRANSIENT.test(msg)
      if (/blockhash not found|timed out/i.test(msg)) cachedBlockhash = undefined
      if (!transient || i >= tries) throw e
      await sleep(1500 * i)
    }
  }
}

export type Attempt = { ok: true; sig: string } | { ok: false; reason?: string; message: string }

/** Like `send`, but turns Holdfast rejections into a value (and logs them as 'blocked' events). */
// Bot actions pass through a small gate so they complete in the order they were scheduled
// (otherwise, under a throttled RPC, every bot's requests interleave and everyone is late).
const MAX_ACTIONS = Number(process.env.SIM_ACTIONS ?? (NETWORK === 'localnet' ? 32 : 2))
let activeActions = 0
const actionQueue: (() => void)[] = []
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  while (activeActions >= MAX_ACTIONS) await new Promise<void>((r) => actionQueue.push(r))
  activeActions++
  try {
    return await fn()
  } finally {
    activeActions--
    actionQueue.shift()?.()
  }
}

export async function attempt(bot: Bot, what: string, build: () => Promise<Transaction>, tries = 3): Promise<Attempt> {
  return gate(() => attemptNow(bot, what, build, tries))
}

async function attemptNow(bot: Bot, what: string, build: () => Promise<Transaction>, tries: number): Promise<Attempt> {
  for (let i = 1; ; i++) {
    try {
      return { ok: true, sig: await send(build, [bot.kp]) }
    } catch (e) {
      const reason = holdfastErrorName(e)
      // a Holdfast rejection is the point: report it. Anything else (usually slippage when bots
      // trade at the same moment) gets a fresh quote and another go.
      if (!reason && i < tries) {
        await sleep(800 * i)
        continue
      }
      const message = explainError(e)
      emit({ kind: reason ? 'blocked' : 'error', persona: bot.persona, bot: bot.name, reason, message: `${what} → ${message}` })
      return { ok: false, reason, message }
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const sleepUntil = async (tSecs: number) => {
  const ms = tSecs * 1000 - (Date.now() - t0)
  if (ms > 0) await sleep(ms)
}

// ---------------------------------------------------------------------------------------------
// Accounting

/**
 * SOL that left `owner` because of the trade itself in tx `sig`: balance delta minus the tx fee and
 * minus rent for accounts the tx created (ATA, holder record) — so the "invested" figure is the swap only.
 */
export async function tradeSolDelta(sig: string, owner: PublicKey): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).catch(() => null)
    if (tx?.meta) {
      const keys = tx.transaction.message.staticAccountKeys
      const pre = tx.meta.preBalances
      const post = tx.meta.postBalances
      const o = keys.findIndex((k) => k.equals(owner))
      let rent = 0
      keys.forEach((k, j) => {
        if (j !== o && pre[j] === 0 && post[j] > 0) rent += post[j]
      })
      const fee = o === 0 ? tx.meta.fee : 0
      return pre[o] - post[o] - fee - rent // > 0 = SOL spent on the trade, < 0 = SOL received
    }
    await sleep(1500)
  }
  throw new Error(`tx ${sig} not found`)
}

export async function tokenBalance(mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, holderTokenAccount(mint, owner), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount
  } catch {
    return 0n
  }
}

/** Deterministic PRNG (mulberry32) so runs are reproducible. */
export function rng(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
