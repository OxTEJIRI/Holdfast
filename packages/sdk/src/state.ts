/** Account getters and the conviction/rewards views the UI needs. */
import { Connection, PublicKey } from '@solana/web3.js'
import type BN from 'bn.js'
import { holderPda, holderTokenAccount, launchPda } from './pda'
import { type HolderAccount, type LaunchAccount, holdfastProgram } from './program'

const big = (x: BN | number | bigint) => BigInt(x.toString())
export const nowSecs = () => Math.floor(Date.now() / 1000)

export type Launch = LaunchAccount & {
  address: PublicKey
  /** keeper (fallback) mode when no DFS vault is set */
  feeMode: 'dfs' | 'keeper'
  /** unix seconds: opening window ends */
  windowEndsAt: number
  /** unix seconds: after this the hook cannot reject any transfer (launch + window + lock) */
  protectionEndsAt: number
}

export type Holder = HolderAccount & { address: PublicKey }

function view(address: PublicKey, l: LaunchAccount): Launch {
  const start = l.launchTs.toNumber()
  return {
    ...l, address,
    feeMode: l.feeVault.equals(PublicKey.default) ? 'keeper' : 'dfs',
    windowEndsAt: start + l.windowSecs,
    protectionEndsAt: start + l.windowSecs + l.snipeLockSecs,
  }
}

export async function getLaunch(conn: Connection, mint: PublicKey): Promise<Launch | null> {
  const address = launchPda(mint)
  const l = await holdfastProgram(conn).account.launch.fetchNullable(address)
  return l ? view(address, l) : null
}

/** Holder record by the token account it tracks. */
export async function getHolder(conn: Connection, tokenAccount: PublicKey): Promise<Holder | null> {
  const address = holderPda(tokenAccount)
  const h = await holdfastProgram(conn).account.holder.fetchNullable(address)
  return h ? { ...h, address } : null
}

/** Holder record for an owner's ATA of `mint`. */
export const getHolderForOwner = (conn: Connection, mint: PublicKey, owner: PublicKey) => getHolder(conn, holderTokenAccount(mint, owner))

/** A record's conviction points as of `ts` (accrual is lazy on-chain). */
export function pointsAt(h: HolderAccount, ts: number): bigint {
  return big(h.points) + big(h.trackedBalance) * BigInt(Math.max(0, ts - h.lastTs.toNumber()))
}

/** Total points across all records as of `ts`. */
export function totalPointsAt(l: LaunchAccount, ts: number): bigint {
  return big(l.totalPoints) + big(l.totalTracked) * BigInt(Math.max(0, ts - l.globalLastTs.toNumber()))
}

/** Final points (frozen at graduation) — what rewards are paid on. */
export const finalPointsOf = (h: HolderAccount, l: LaunchAccount) => pointsAt(h, l.finalTs.toNumber())

/**
 * Live share of all future rewards this record would get if graduation happened at `now`
 * (or its actual final share once finalized). 0..1.
 */
export function projectedShare(h: HolderAccount, l: LaunchAccount, now = nowSecs()): number {
  const [mine, total] = l.finalized ? [finalPointsOf(h, l), big(l.finalTotalPoints)] : [pointsAt(h, now), totalPointsAt(l, now)]
  if (total === 0n) return 0
  return Number((mine * 1_000_000_000n) / total) / 1e9
}

/** Lamports the record can claim right now (after the latest sync/deposit). */
export function claimable(h: HolderAccount, l: LaunchAccount): bigint {
  if (!l.finalized) return 0n
  const entitled = (finalPointsOf(h, l) * big(l.accRewardPerPoint)) >> 64n
  const owed = entitled - big(h.rewardDebt)
  return owed > 0n ? owed : 0n
}

/** Points forfeited by moving `amount` out of a record now ("selling 25% costs you 25% of your points"). */
export function forfeitPreview(h: HolderAccount, amount: bigint, now = nowSecs()): bigint {
  const b = big(h.trackedBalance)
  if (b === 0n) return 0n
  const m = amount < b ? amount : b
  return (pointsAt(h, now) * m) / b
}

export type LeaderboardRow = {
  rank: number
  owner: PublicKey
  tokenAccount: PublicKey
  holder: PublicKey
  trackedBalance: bigint
  points: bigint
  share: number
  unlockTs: number
  claimed: bigint
}

/** Top `limit` records by (projected or final) points. */
export async function getLeaderboard(conn: Connection, mint: PublicKey, limit = 20, now = nowSecs()): Promise<LeaderboardRow[]> {
  const program = holdfastProgram(conn)
  const launchAddr = launchPda(mint)
  const [launch, holders] = await Promise.all([
    program.account.launch.fetch(launchAddr),
    program.account.holder.all([{ memcmp: { offset: 8, bytes: launchAddr.toBase58() } }]),
  ])
  const ts = launch.finalized ? launch.finalTs.toNumber() : now
  const total = launch.finalized ? big(launch.finalTotalPoints) : totalPointsAt(launch, now)
  return holders
    .map(({ publicKey, account: h }) => {
      const points = pointsAt(h, ts)
      return {
        rank: 0, owner: h.owner, tokenAccount: h.tokenAccount, holder: publicKey, trackedBalance: big(h.trackedBalance),
        points, share: total === 0n ? 0 : Number((points * 1_000_000_000n) / total) / 1e9,
        unlockTs: h.unlockTs.toNumber(), claimed: big(h.claimed),
      }
    })
    .sort((a, b) => (b.points > a.points ? 1 : b.points < a.points ? -1 : 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}
