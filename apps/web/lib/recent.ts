/** "Recently opened on this device": a convenience only, never a source of truth. */
const KEY = 'holdfast.recent'
const MAX = 20

export function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberMint(mint: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([mint, ...readRecent().filter((m) => m !== mint)].slice(0, MAX)))
  } catch {
    // storage unavailable (private window, blocked site data)
  }
}
