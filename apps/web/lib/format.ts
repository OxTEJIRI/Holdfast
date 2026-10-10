/** Display helpers: big numbers, SOL, percentages, durations. */
export const SOL = 1_000_000_000

export function sol(lamports: number | bigint, digits = 4) {
  return (Number(lamports) / SOL).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) })
}

export function pct(share: number, digits = 2) {
  return `${(share * 100).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']
/** 1234567 → "1.23M" (for conviction points: token-units × seconds). */
export function compact(x: bigint | number, digits = 2) {
  let n = typeof x === 'bigint' ? Number(x) : x
  let i = 0
  while (Math.abs(n) >= 1000 && i < UNITS.length - 1) {
    n /= 1000
    i++
  }
  return `${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? digits : n < 100 ? 1 : 0 })}${UNITS[i]}`
}

/** Base units (6 decimals) → whole tokens, compact. */
export const tokens = (base: bigint | number) => compact(Number(base) / 1e6)

/** 75 → "1:15", 3725 → "1:02:05" */
export function clock(secs: number) {
  const s = Math.max(0, Math.floor(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export function short(key: string, n = 4) {
  return `${key.slice(0, n)}…${key.slice(-n)}`
}

export const timeOfDay = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-GB', { hour12: false })
