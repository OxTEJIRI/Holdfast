'use client'
import { useEffect, useRef } from 'react'

/**
 * Kelp forest for the hero. Each stalk is a chain of segments swaying on layered sine waves;
 * fronds hang off it and every stalk is pinned to the rock by a branching holdfast (the root).
 */
export function Kelp({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    let raf = 0
    type Stalk = { x: number; height: number; seed: number; hue: number; thick: number; fronds: number }
    let stalks: Stalk[] = []
    const build = () => {
      const n = Math.max(7, Math.floor(w / dpr / 70))
      stalks = Array.from({ length: n }, (_, i) => ({
        x: ((i + 0.5 + (Math.random() - 0.5) * 0.7) / n) * w,
        height: (0.45 + Math.random() * 0.55) * h,
        seed: Math.random() * 100,
        hue: 150 + Math.random() * 38,
        thick: (3 + Math.random() * 4) * dpr,
        fronds: 5 + Math.floor(Math.random() * 6),
      }))
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = canvas.width = Math.floor(r.width * dpr)
      h = canvas.height = Math.floor(r.height * dpr)
      build()
    }
    const sway = (s: Stalk, u: number, t: number) =>
      Math.sin(t / 2600 + s.seed + u * 2.2) * 16 * dpr * u + Math.sin(t / 1500 + s.seed * 2 + u * 4) * 5 * dpr * u
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      // far stalks first (shorter = further)
      for (const s of [...stalks].sort((a, b) => a.height - b.height)) {
        const depth = s.height / h
        const alpha = 0.28 + depth * 0.5
        const SEG = 22
        const pts: [number, number][] = []
        for (let i = 0; i <= SEG; i++) {
          const u = i / SEG
          pts.push([s.x + sway(s, u, t), h - u * s.height])
        }
        // holdfast: branching roots gripping the rock
        ctx.strokeStyle = `hsla(${s.hue - 20},45%,32%,${alpha})`
        ctx.lineWidth = s.thick * 0.55
        ctx.lineCap = 'round'
        for (let k = -3; k <= 3; k++) {
          ctx.beginPath()
          ctx.moveTo(s.x, h - 2 * dpr)
          ctx.quadraticCurveTo(s.x + k * 9 * dpr, h - 14 * dpr, s.x + k * 17 * dpr, h + 3 * dpr)
          ctx.stroke()
        }
        // stalk
        const g = ctx.createLinearGradient(0, h, 0, h - s.height)
        g.addColorStop(0, `hsla(${s.hue - 10},50%,26%,${alpha})`)
        g.addColorStop(1, `hsla(${s.hue + 14},70%,58%,${alpha})`)
        ctx.strokeStyle = g
        ctx.lineWidth = s.thick
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
        // fronds
        for (let f = 0; f < s.fronds; f++) {
          const u = 0.18 + (f / s.fronds) * 0.82
          const [px, py] = pts[Math.floor(u * SEG)]
          const dir = f % 2 ? 1 : -1
          const len = (26 + 40 * (1 - u * 0.4)) * dpr
          const flap = Math.sin(t / 1100 + s.seed + f * 1.3) * 7 * dpr
          ctx.fillStyle = `hsla(${s.hue + 6},62%,${40 + u * 22}%,${alpha * 0.85})`
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.quadraticCurveTo(px + dir * len * 0.55, py - len * 0.28 + flap, px + dir * len, py + len * 0.34 + flap)
          ctx.quadraticCurveTo(px + dir * len * 0.5, py + len * 0.12, px, py + 3 * dpr)
          ctx.fill()
        }
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
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf)
      if (e.isIntersecting && !still) raf = requestAnimationFrame(loop)
    })
    io.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} aria-hidden className={`pointer-events-none block w-full ${className}`} />
}
