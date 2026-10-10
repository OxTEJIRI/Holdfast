'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs `fn` now and every `ms` (paused while the tab is hidden). Returns the latest value, the
 * error if the last run failed, and `refresh()` to re-run immediately (e.g. after a transaction).
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<unknown>()
  const fnRef = useRef(fn)
  fnRef.current = fn
  const run = useCallback(async () => {
    try {
      setData(await fnRef.current())
      setError(undefined)
    } catch (e) {
      setError(e)
    }
  }, [])
  useEffect(() => {
    let alive = true
    run()
    const id = setInterval(() => {
      if (alive && document.visibilityState === 'visible') run()
    }, ms)
    return () => {
      alive = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, run, ...deps])
  return { data, error, refresh: run }
}
