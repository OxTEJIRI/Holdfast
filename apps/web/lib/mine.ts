import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { type Connection, PublicKey } from '@solana/web3.js'
import { type Holder, type Launch, getHolderForOwner, getLaunch, holdfastProgram, launchView } from '@holdfast/sdk'
import { type TokenMeta, loadMeta } from './useLaunch'

/**
 * Byte offsets inside the on-chain accounts (programs/holdfast/src/state.rs), after the 8-byte Anchor discriminator:
 *   Launch: mint 32 · dbc_pool 32 · dbc_config 32 · creator 32 …  → creator at 8 + 32 + 32 + 32 = 104
 *   Holder: launch 32 · token_account 32 · owner 32 …             → owner   at 8 + 32 + 32      = 72
 */
export const LAUNCH_CREATOR_OFFSET = 104
export const HOLDER_OWNER_OFFSET = 72

/** The newest launches shown; keeps the number of RPC calls bounded on the public devnet endpoint. */
const MAX_ROWS = 24

export type MineRow = {
  mint: PublicKey
  launch: Launch
  meta: TokenMeta
  migrated: boolean
  curveComplete: boolean
  holder: Holder | null
  creator: boolean
}

/** Retries rate-limited (429) and transient failures with a short backoff. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw last
}

/** Runs `fn` over `items` with at most `n` in flight. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

type Pending = { mint: PublicKey; launch: Launch; holder: Holder | null; creator: boolean }

async function withState(conn: Connection, items: Pending[]): Promise<MineRow[]> {
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const rows = await mapLimit(items, 4, async (it) => {
    const [meta, pool] = await Promise.all([withRetry(() => loadMeta(conn, it.mint)), withRetry(() => dbc.state.getPool(it.launch.dbcPool))])
    if (!pool) return null
    return {
      ...it,
      meta,
      curveComplete: pool.poolState.finishCurveTimestamp.gtn(0),
      migrated: pool.poolState.isMigrated === 1,
    } satisfies MineRow
  })
  return rows.filter((r): r is MineRow => r !== null)
}

const newestFirst = (a: Pending, b: Pending) => b.launch.launchTs.toNumber() - a.launch.launchTs.toNumber()

/** Every Holdfast launch `owner` created or holds a record in, newest first. Read-only. */
export async function loadMine(conn: Connection, owner: PublicKey): Promise<MineRow[]> {
  const program = holdfastProgram(conn)
  const bytes = owner.toBase58()
  const [launched, held] = await withRetry(() =>
    Promise.all([
      program.account.launch.all([{ dataSize: program.account.launch.size }, { memcmp: { offset: LAUNCH_CREATOR_OFFSET, bytes } }]),
      program.account.holder.all([{ dataSize: program.account.holder.size }, { memcmp: { offset: HOLDER_OWNER_OFFSET, bytes } }]),
    ]),
  )

  const byMint = new Map<string, Pending>()
  for (const { publicKey, account } of launched) {
    byMint.set(account.mint.toBase58(), { mint: account.mint, launch: launchView(publicKey, account), holder: null, creator: true })
  }
  // holder records name their launch account, not the mint: fetch the launches we don't have yet
  const missing = [...new Set(held.map((h) => h.account.launch.toBase58()))]
    .map((a) => new PublicKey(a))
    .filter((a) => ![...byMint.values()].some((p) => p.launch.address.equals(a)))
  const fetched = missing.length ? await withRetry(() => program.account.launch.fetchMultiple(missing)) : []
  missing.forEach((address, i) => {
    const l = fetched[i]
    if (l) byMint.set(l.mint.toBase58(), { mint: l.mint, launch: launchView(address, l), holder: null, creator: false })
  })
  for (const { publicKey, account } of held) {
    const p = [...byMint.values()].find((x) => x.launch.address.equals(account.launch))
    if (p) p.holder = { ...account, address: publicKey }
  }
  return withState(conn, [...byMint.values()].sort(newestFirst).slice(0, MAX_ROWS))
}

/** The same rows for specific mints (the "recently opened" list), with `owner`'s record when connected. */
export async function loadMints(conn: Connection, mints: string[], owner: PublicKey | null): Promise<MineRow[]> {
  const items = await mapLimit(mints, 4, async (m): Promise<Pending | null> => {
    let mint: PublicKey
    try {
      mint = new PublicKey(m)
    } catch {
      return null
    }
    const launch = await withRetry(() => getLaunch(conn, mint))
    if (!launch) return null
    const holder = owner ? await withRetry(() => getHolderForOwner(conn, mint, owner)) : null
    return { mint, launch, holder, creator: !!owner && launch.creator.equals(owner) }
  })
  return withState(conn, items.filter((i): i is Pending => i !== null))
}

