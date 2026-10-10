/** Types + server-side loading of the recorded Arena run (apps/web/data/arena, copied from docs/arena/devnet). */
export type Persona = 'sniper' | 'bundler' | 'bundle' | 'whale' | 'flipper' | 'holder' | 'closer'

export type ArenaEvent = {
  t: number
  ts: number
  kind: 'phase' | 'launch' | 'buy' | 'sell' | 'transfer' | 'blocked' | 'graduate' | 'finalize' | 'migrate' | 'deposit' | 'claim' | 'swap' | 'error'
  persona?: Persona
  bot?: string
  sol?: number
  tokens?: number
  reason?: string
  message: string
  sig?: string
}

export type ArenaSummary = {
  network: string
  mint: string
  speed: number
  durationSecs: number
  rewardsPaidSol: { round1BondingFees: number; round2LpFees: number }
  personas: { persona: string; bots: number; investedSol: number; proceedsSol: number; rewardsSol: number; rewardsPerSol: number; blocked: Record<string, number> }[]
  holdersVsFlippers: number | string
  holdersVsSnipers: number | string
  successMetric: { rule: string; met: boolean }
  blockedTotal: number
  keyTxs: Record<string, string>
  explorer: string
}

export type ArenaMeta = { network: string; mint: string; launchTs: number; windowSecs: number; snipeLockSecs: number; maxWalletBps: number; speed: number }
export type BotNames = Record<string, { name: string; persona: Persona }>
