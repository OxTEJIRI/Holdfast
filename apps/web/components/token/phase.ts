import type { LaunchData } from '@/lib/useLaunch'

export type Phase = 'window' | 'locks' | 'free' | 'graduated' | 'migrated'

export function phaseOf(d: LaunchData, now: number): Phase {
  if (d.migrated) return 'migrated'
  if (d.curveComplete) return 'graduated'
  if (now < d.launch.windowEndsAt) return 'window'
  if (now < d.launch.protectionEndsAt) return 'locks'
  return 'free'
}

export const PHASE_LABEL: Record<Phase, string> = {
  window: 'Opening window',
  locks: 'Snipe-locks running',
  free: 'Free trading',
  graduated: 'Graduated',
  migrated: 'Trading on DAMM v2',
}
