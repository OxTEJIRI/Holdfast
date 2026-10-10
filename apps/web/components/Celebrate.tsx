'use client'
import { useEffect, useRef } from 'react'

export type CelebrateDetail = { text?: string; sub?: string; x?: number; y?: number }

/** Fire from anywhere: celebrate({ text: '+0.0166 SOL', sub: 'claimed' }). */
export function celebrate(detail: CelebrateDetail = {}) {
  window.dispatchEvent(new CustomEvent<CelebrateDetail>('holdfast:celebrate', { detail }))
}

/**
 * A full-screen water ripple: concentric rings spread from the point of the action while bubbles and
 * sparks rise, with a floating amount. Under reduced motion only the text appears.
 */
export function Celebrate() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; hue: number }
    let rings: { x: number; y: number; r: number; a: number; w: number }[] = []
    let parts: P[] = []
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const r of rings) {
        r.r += 7 * dpr
        r.a *= 0.965
        ctx.strokeStyle = `rgba(110,231,196,${r.a})`
        ctx.lineWidth = r.w * dpr
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.r, 0, 6.283)
        ctx.stroke()
      }
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.vy -= 0.02 * dpr
        p.a *= 0.972
        ctx.fillStyle = `hsla(${p.hue},80%,72%,${p.a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, 6.283)
        ctx.fill()
      }
      rings = rings.filter((r) => r.a > 0.02)
      parts = parts.filter((p) => p.a > 0.03)
      raf = rings.length || parts.length ? requestAnimationFrame(frame) : 0
      if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    const on = (e: Event) => {
      const d = (e as CustomEvent<CelebrateDetail>).detail ?? {}
      const x = (d.x ?? window.innerWidth / 2) * dpr
      const y = (d.y ?? window.innerHeight / 2) * dpr
      if (!still) {
        for (let i = 0; i < 4; i++) setTimeout(() => rings.push({ x, y, r: 6 * dpr, a: 0.75 - i * 0.1, w: 3 - i * 0.5 }), i * 140)
        for (let i = 0; i < 46; i++) {
          const ang = Math.random() * 6.283
          const sp = (1 + Math.random() * 4.5) * dpr
          parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.2 * dpr, r: (1.2 + Math.random() * 3) * dpr, a: 0.95, hue: 150 + Math.random() * 40 })
        }
        if (!raf) raf = requestAnimationFrame(frame)
      }
      const el = labelRef.current!
      el.style.left = `${d.x ?? window.innerWidth / 2}px`
      el.style.top = `${d.y ?? window.innerHeight / 2}px`
      el.firstElementChild!.textContent = d.text ?? ''
      el.lastElementChild!.textContent = d.sub ?? ''
      el.classList.remove('celebrate-text')
      void el.offsetWidth
      el.classList.add('celebrate-text')
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('holdfast:celebrate', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('holdfast:celebrate', on)
    }
  }, [])
  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />
      <div ref={labelRef} aria-hidden className="pointer-events-none fixed z-[61] -translate-x-1/2 -translate-y-1/2 text-center opacity-0">
        <div className="display text-5xl font-extrabold text-grad drop-shadow-[0_0_24px_rgba(110,231,196,0.7)]" />
        <div className="mt-1 text-sm font-semibold uppercase tracking-[0.2em] text-teal" />
      </div>
    </>
  )
}
