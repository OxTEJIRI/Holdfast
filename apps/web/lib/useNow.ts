'use client'
import { useEffect, useState } from 'react'

/** Unix seconds, ticking every `ms` (for countdowns and live conviction). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
