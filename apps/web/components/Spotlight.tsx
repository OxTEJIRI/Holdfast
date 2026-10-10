'use client'
import { useEffect } from 'react'

/** Cards catch a soft light where the pointer is (sets --mx/--my on the card under it). */
export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const on = (e: PointerEvent) => {
      const card = (e.target as HTMLElement | null)?.closest?.('.card') as HTMLElement | null
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    document.addEventListener('pointermove', on, { passive: true })
    return () => document.removeEventListener('pointermove', on)
  }, [])
  return null
}
