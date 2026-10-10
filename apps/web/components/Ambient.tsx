'use client'
import { useEffect, useRef } from 'react'

/**
 * The water column behind every page: slow light shafts from the surface and drifting plankton.
 * Fixed, non-interactive, paused when the tab is hidden, a still frame under reduced motion.
 */
export function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let raf = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const motes = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.00004, vy: -0.00004 - Math.random() * 0.00012, ph: Math.random() * 6.28,
    }))
    const resize = () => {
      w = canvas.width = Math.floor(window.innerWidth * dpr)
      h = canvas.height = Math.floor(window.innerHeight * dpr)
    }
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      // light shafts: soft slanted bands that slowly breathe
      for (let i = 0; i < 5; i++) {
        const x = (0.12 + i * 0.2) * w + Math.sin(t / 9000 + i * 1.7) * 0.05 * w
        const wid = (0.05 + 0.03 * Math.sin(t / 7000 + i)) * w
        const g = ctx.createLinearGradient(x, 0, x - 0.22 * w, h * 0.9)
        g.addColorStop(0, `rgba(160,255,230,${0.05 + 0.02 * Math.sin(t / 5000 + i)})`)
        g.addColorStop(1, 'rgba(160,255,230,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + wid, 0)
        ctx.lineTo(x + wid - 0.22 * w, h * 0.9)
        ctx.lineTo(x - 0.22 * w, h * 0.9)
        ctx.fill()
      }
      for (const m of motes) {
        if (!still) {
          m.x += m.vx * 16 + Math.sin(t / 2500 + m.ph) * 0.00006
          m.y += m.vy * 16
          if (m.y < -0.02) m.y = 1.02
          if (m.x < -0.02) m.x = 1.02
          if (m.x > 1.02) m.x = -0.02
        }
        const a = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t / 1800 + m.ph))
        ctx.fillStyle = `rgba(190,255,235,${a})`
        ctx.beginPath()
        ctx.arc(m.x * w, m.y * h, m.r * dpr, 0, 6.283)
        ctx.fill()
      }
    }
    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    resize()
    window.addEventListener('resize', resize)
    if (still) draw(0)
    else raf = requestAnimationFrame(loop)
    const vis = () => {
      cancelAnimationFrame(raf)
      if (!still && document.visibilityState === 'visible') raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
}
