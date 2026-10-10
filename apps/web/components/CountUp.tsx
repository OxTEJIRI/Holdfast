'use client'
import { useEffect, useRef, useState } from 'react'

/** Counts from 0 to `to` the first time it scrolls into view (instant under reduced motion). */
export function CountUp({ to, digits = 0, suffix = '', duration = 1400 }: { to: number; digits?: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [v, setV] = useState(to)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setV(0)
    const el = ref.current!
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / duration)
        setV(to * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to, duration])
  return (
    <span ref={ref} className="num">
      {v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
      {suffix}
    </span>
  )
}
