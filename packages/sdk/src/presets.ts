/**
 * Launch presets (DESIGN.md §4.2) and the DBC config builder (§4.1).
 */
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  type ConfigParameters,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  buildCurveWithLiquidityWeights,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CAPS, type Network, TOTAL_SUPPLY_TOKENS } from './constants'

/** DFS split in percent: holders / creator / treasury. Must sum to 100; holders ≥ 50. */
export type Split = { holders: number; creator: number; treasury: number }

/** Opening-window protection rules enforced by the hook (DESIGN.md §3.2). */
export type Rules = { windowSecs: number; snipeLockSecs: number; maxWalletBps: number }

/** Anti-sniper base fee: exponential decay from `startBps` to `endBps` over `durationSecs`. */
export type FeeSchedule = { startBps: number; endBps: number; durationSecs: number; periods: number }

export type HoldfastPreset = {
  id: PresetId
  name: string
  tagline: string
  /** 'standard' = constant-product curve from a migration threshold; 'liquidityWeights' = back-loaded liquidity */
  curve: { kind: 'standard' } | { kind: 'liquidityWeights'; weights: number[] }
  fee: FeeSchedule
  rules: Rules
  /** Quote (SOL) raised at graduation */
  thresholdSol: { mainnet: number; devnet: number }
  split: Split
}

export type PresetId = 'fairLaunch' | 'slowBurn' | 'arena'

export const presets: Record<PresetId, HoldfastPreset> = {
  fairLaunch: {
    id: 'fairLaunch',
    name: 'Fair Launch',
    tagline: 'Memes and AI tokens: snipers locked out, holders paid.',
    curve: { kind: 'standard' },
    fee: { startBps: 5000, endBps: 100, durationSecs: 120, periods: 24 },
    rules: { windowSecs: 120, snipeLockSecs: 900, maxWalletBps: 150 },
    thresholdSol: { mainnet: 80, devnet: 3 },
    split: { holders: 60, creator: 30, treasury: 10 },
  },
  slowBurn: {
    id: 'slowBurn',
    name: 'Slow Burn',
    tagline: 'Community and RWA-style raises: long window, deep late liquidity.',
    curve: { kind: 'liquidityWeights', weights: Array.from({ length: 16 }, (_, i) => 1.2 ** i) },
    fee: { startBps: 2500, endBps: 100, durationSecs: 300, periods: 30 },
    rules: { windowSecs: 300, snipeLockSecs: 1800, maxWalletBps: 100 },
    thresholdSol: { mainnet: 200, devnet: 5 },
    split: { holders: 70, creator: 25, treasury: 5 },
  },
  arena: {
    id: 'arena',
    name: 'Arena (demo)',
    tagline: 'The live simulation: everything compressed into minutes.',
    curve: { kind: 'standard' },
    fee: { startBps: 3000, endBps: 100, durationSecs: 30, periods: 10 },
    rules: { windowSecs: 45, snipeLockSecs: 150, maxWalletBps: 300 },
    thresholdSol: { mainnet: 2, devnet: 2 },
    split: { holders: 60, creator: 30, treasury: 10 },
  },
}

export type PresetOverrides = Partial<{
  rules: Partial<Rules>
  fee: Partial<FeeSchedule>
  thresholdSol: number
  split: Split
}>

export type ResolvedPreset = Omit<HoldfastPreset, 'thresholdSol'> & { thresholdSol: number }

/** Applies overrides and validates everything against the program caps. Throws with a readable message. */
export function resolvePreset(preset: HoldfastPreset | PresetId, overrides: PresetOverrides = {}, network: Network = 'devnet'): ResolvedPreset {
  const p = typeof preset === 'string' ? presets[preset] : preset
  const r: ResolvedPreset = {
    ...p,
    rules: { ...p.rules, ...overrides.rules },
    fee: { ...p.fee, ...overrides.fee },
    thresholdSol: overrides.thresholdSol ?? (network === 'mainnet' ? p.thresholdSol.mainnet : p.thresholdSol.devnet),
    split: overrides.split ?? p.split,
  }
  validateRules(r.rules)
  validateSplit(r.split)
  if (!(r.thresholdSol > 0)) throw new Error('Graduation threshold must be positive')
  return r
}

export function validateRules(rules: Rules) {
  const int = (x: number) => Number.isInteger(x) && x >= 0
  if (!int(rules.windowSecs) || rules.windowSecs > CAPS.maxWindowSecs) {
    throw new Error(`Opening window must be 0–${CAPS.maxWindowSecs} s`)
  }
  if (!int(rules.snipeLockSecs) || rules.snipeLockSecs > CAPS.maxSnipeLockSecs) {
    throw new Error(`Snipe-lock must be 0–${CAPS.maxSnipeLockSecs} s`)
  }
  if (!int(rules.maxWalletBps) || (rules.maxWalletBps !== 0 && (rules.maxWalletBps < CAPS.minMaxWalletBps || rules.maxWalletBps > 10_000))) {
    throw new Error(`Max wallet must be off (0) or ${CAPS.minMaxWalletBps}–10000 bps`)
  }
}

export function validateSplit(s: Split) {
  if ([s.holders, s.creator, s.treasury].some((x) => !Number.isInteger(x) || x < 0)) throw new Error('Split parts must be whole percentages')
  if (s.holders + s.creator + s.treasury !== 100) throw new Error('Reward split must add up to 100%')
  if (s.holders < 50) throw new Error('Holders must get at least 50% of fees')
}

/** Latest moment the hook can reject anything: launch + window + lock (≤ 40 min by the caps). */
export const protectionEndsAfterSecs = (rules: Rules) => rules.windowSecs + rules.snipeLockSecs

/**
 * DBC `ConfigParameters` for a Holdfast launch (DESIGN.md §4.1). Spread into
 * `client.partner.createConfigWithTransferHook({ ...config, transferHookProgram, feeClaimer, … })`.
 */
export function buildHoldfastConfig(
  preset: HoldfastPreset | PresetId,
  overrides: PresetOverrides = {},
  { network }: { network: Network } = { network: 'devnet' },
): ConfigParameters {
  const r = resolvePreset(preset, overrides, network)
  const flat = r.fee.startBps === r.fee.endBps
  const base = {
    token: {
      tokenType: TokenType.Token2022,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: TOTAL_SUPPLY_TOKENS,
      // the liquidity-weights builder needs a rounding allowance (DBC SDK: "leftOverDelta must be less
      // than totalLeftover"); 10k tokens = 0.001% of supply, withdrawable by the treasury after migration
      leftover: r.curve.kind === 'liquidityWeights' ? 10_000 : 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: (flat ? BaseFeeMode.FeeSchedulerLinear : BaseFeeMode.FeeSchedulerExponential) as
          | BaseFeeMode.FeeSchedulerLinear
          | BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: flat
          ? { startingFeeBps: r.fee.startBps, endingFeeBps: r.fee.endBps, numberOfPeriod: 0, totalDuration: 0 }
          : { startingFeeBps: r.fee.startBps, endingFeeBps: r.fee.endBps, numberOfPeriod: r.fee.periods, totalDuration: r.fee.durationSecs },
      },
      dynamicFeeEnabled: !flat,
      // all fees in SOL, so fee claims never move the hooked base token
      collectFeeMode: CollectFeeMode.QuoteToken,
      // 100% of the non-protocol fee goes to the partner side = the DFS vault, which then splits
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.Compounding,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
        compoundingFeeBps: 5000,
      },
    },
    liquidityDistribution: {
      // partner LP (owned by the fee claimer) permanently locked → perpetual holder fees
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      // creator LP vests: 7-day cliff, then 90 daily periods
      creatorLiquidityVestingInfoParams: {
        vestingPercentage: 50,
        bpsPerPeriod: 111,
        numberOfPeriods: 90,
        cliffDurationFromMigrationTime: 7 * 86_400,
        totalDuration: 90 * 86_400,
      },
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
  }

  if (r.curve.kind === 'standard') {
    return buildCurve({ ...base, percentageSupplyOnMigration: 20, migrationQuoteThreshold: r.thresholdSol })
  }
  // Liquidity-weighted curves are parameterised by market caps; the raised quote scales linearly
  // with them, so build once and rescale to hit the preset's threshold.
  const weights = r.curve.weights
  const build = (k: number) =>
    buildCurveWithLiquidityWeights({ ...base, initialMarketCap: 30 * k, migrationMarketCap: 300 * k, liquidityWeights: weights })
  const probe = build(1)
  const raisedAtProbe = Number(probe.migrationQuoteThreshold.toString()) / 1e9
  return build(r.thresholdSol / raisedAtProbe)
}
