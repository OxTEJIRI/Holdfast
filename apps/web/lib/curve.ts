import { Rounding, getDeltaAmountQuoteUnsigned, getPriceFromSqrtPrice, type ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'

export type CurvePoint = { raised: number; mcap: number }

/**
 * Market cap (SOL) against SOL raised, sampled along the config's curve segments
 * (docs.meteora.ag/core-products/dbc/formulas): each segment holds liquidity L between two sqrt prices;
 * quote raised across it is L·(√pᵤ − √pₗ), price is (√p)² scaled by decimals.
 */
export function curvePoints(cfg: ConfigParameters, totalSupplyTokens: number, samples = 6): CurvePoint[] {
  const threshold = Number(cfg.migrationQuoteThreshold.toString()) / 1e9
  const mcapAt = (sqrt: BN) => getPriceFromSqrtPrice(sqrt, 6, 9).toNumber() * totalSupplyTokens
  const pts: CurvePoint[] = [{ raised: 0, mcap: mcapAt(cfg.sqrtStartPrice) }]
  let lower = cfg.sqrtStartPrice
  let raised = 0
  for (const seg of cfg.curve) {
    const upper = seg.sqrtPrice
    if (upper.lte(lower)) continue
    for (let k = 1; k <= samples; k++) {
      const s = lower.add(upper.sub(lower).muln(k).divn(samples))
      const q = Number(getDeltaAmountQuoteUnsigned(lower, s, seg.liquidity, Rounding.Down).toString()) / 1e9
      pts.push({ raised: raised + q, mcap: mcapAt(s) })
      if (raised + q >= threshold) return pts.filter((p) => p.raised <= threshold * 1.0001)
    }
    raised += Number(getDeltaAmountQuoteUnsigned(lower, upper, seg.liquidity, Rounding.Down).toString()) / 1e9
    lower = upper
  }
  return pts
}
