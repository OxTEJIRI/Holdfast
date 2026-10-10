'use client'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from '@solana/spl-token'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { type Holder, type Launch, type LeaderboardRow, getHolderForOwner, getLaunch, getLeaderboard, holderTokenAccount } from '@holdfast/sdk'
import { useMemo, useRef } from 'react'
import { usePoll } from './usePoll'

export type TokenMeta = { name: string; symbol: string; image?: string; description?: string; holdersPct?: number }

export type LaunchData = {
  launch: Launch
  meta: TokenMeta
  /** SOL raised so far / graduation threshold (lamports) */
  quoteReserve: bigint
  threshold: bigint
  progress: number
  curveComplete: boolean
  migrated: boolean
  /** DBC fee claimer: the keeper (keeper mode) or the DFS vault */
  feeClaimer: PublicKey
  holder: Holder | null
  tokenBalance: bigint
  solBalance: number
}

const metaCache = new Map<string, TokenMeta>()

async function loadMeta(conn: import('@solana/web3.js').Connection, mint: PublicKey): Promise<TokenMeta> {
  const key = mint.toBase58()
  const hit = metaCache.get(key)
  if (hit) return hit
  const md = await getTokenMetadata(conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null)
  const meta: TokenMeta = { name: md?.name ?? 'Unnamed', symbol: md?.symbol ?? '???' }
  if (md?.uri) {
    try {
      const json = await (await fetch(md.uri)).json()
      if (typeof json.image === 'string') meta.image = json.image
      if (typeof json.description === 'string') meta.description = json.description
      const hp = json?.properties?.holdfast?.holdersPct
      if (typeof hp === 'number') meta.holdersPct = hp
    } catch {
      // metadata JSON is optional
    }
  }
  metaCache.set(key, meta)
  return meta
}

/** Everything the token page shows, refreshed every few seconds. */
export function useLaunchData(mint: PublicKey | null) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const dbc = useMemo(() => new DynamicBondingCurveClient(connection, 'confirmed'), [connection])
  const configRef = useRef<{ threshold: bigint; feeClaimer: PublicKey } | undefined>(undefined)

  const state = usePoll<LaunchData | null>(
    async () => {
      if (!mint) return null
      const launch = await getLaunch(connection, mint)
      if (!launch) return null
      const [meta, pool] = await Promise.all([loadMeta(connection, mint), dbc.state.getPool(launch.dbcPool)])
      if (!pool) return null
      if (!configRef.current) {
        const config = await dbc.state.getPoolConfig(pool.poolState.config)
        if (!config) return null
        configRef.current = { threshold: BigInt(config.migrationQuoteThreshold.toString()), feeClaimer: config.feeClaimer }
      }
      const { threshold, feeClaimer } = configRef.current
      const quoteReserve = BigInt(pool.poolState.quoteReserve.toString())
      let holder: Holder | null = null
      let tokenBalance = 0n
      let solBalance = 0
      if (publicKey) {
        const [h, bal, lamports] = await Promise.all([
          getHolderForOwner(connection, mint, publicKey),
          connection.getTokenAccountBalance(holderTokenAccount(mint, publicKey)).then((r) => BigInt(r.value.amount)).catch(() => 0n),
          connection.getBalance(publicKey),
        ])
        holder = h
        tokenBalance = bal
        solBalance = lamports
      }
      const curveComplete = pool.poolState.finishCurveTimestamp.gtn(0)
      return {
        launch, meta, quoteReserve, threshold,
        progress: curveComplete ? 1 : threshold > 0n ? Math.min(1, Number(quoteReserve) / Number(threshold)) : 0,
        curveComplete, migrated: pool.poolState.isMigrated === 1, feeClaimer, holder, tokenBalance, solBalance,
      }
    },
    8000,
    [mint?.toBase58(), publicKey?.toBase58()],
  )

  const board = usePoll<LeaderboardRow[]>(async () => (mint ? getLeaderboard(connection, mint, 20) : []), 30000, [mint?.toBase58()])
  return { ...state, board: board.data ?? [], refreshBoard: board.refresh }
}
