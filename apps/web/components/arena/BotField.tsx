'use client'
import { useEffect, useRef } from 'react'
import type { ArenaEvent, Persona } from '@/lib/arena'

/**
 * The Arena as a tank. Bots are small fish that live in a lane per persona. The vertical line is the
 * hook's rule: a blocked attempt rushes the line and is thrown back with an amber ripple; a buy lets the
 * bot through and it settles on the right; a sell sends it drifting out to the right and fading (points
 * forfeited); claims release rising bubbles; graduation dissolves the line (the hook is revoked).
 */
const LANES: { key: Persona | 'bundle'; y: number; color: string; label: string }[] = [
  { key: 'sniper', y: 0.13, color: '#f6b955', label: 'snipers' },
  { key: 'bundler', y: 0.29, color: '#f09a4a', label: 'bundler' },
  { key: 'flipper', y: 0.45, color: '#f27c6b', label: 'flippers' },
  { key: 'whale', y: 0.6, color: '#8fe3d6', label: 'whale' },
  { key: 'closer', y: 0.74, color: '#a9bcb8', label: 'closer' },
  { key: 'holder', y: 0.89, color: '#6ee7c4', label: 'holders' },
]
const laneOf = (p?: Persona) => LANES.find((l) => l.key === (p === 'bundle' ? 'bundler' : p))

type Fish = {
  name: string; lane: (typeof LANES)[number]
  x: number; y: number; tx: number; ty: number
  state: 'waiting' | 'holding' | 'gone'
  size: number; kick: number; glow: number; seen: number; phase: number
}
type Bubble = { x: number; y: number; vy: number; r: number; a: number }
type Ring = { x: number; y: number; r: number; a: number; color: string }

export function BotField({ events }: { events: ArenaEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sim = useRef({ fish: new Map<string, Fish>(), bubbles: [] as Bubble[], rings: [] as Ring[], seen: 0, hookDown: false, flash: 0 })
  const evRef = useRef(events)
  evRef.current = events

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let W = 0
    let H = 0
    let raf = 0
    const GATE = 0.4
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      W = canvas.width = Math.floor(r.width * dpr)
      H = canvas.height = Math.floor(r.height * dpr)
    }
    const S = sim.current
    const fishFor = (name: string, lane: (typeof LANES)[number]): Fish => {
      let f = S.fish.get(name)
      if (!f) {
        const idle = 0.04 + Math.random() * 0.24
        f = { name, lane, x: idle, y: lane.y + (Math.random() - 0.5) * 0.06, tx: idle, ty: lane.y, state: 'waiting', size: 0, kick: 0, glow: 0, seen: 0, phase: Math.random() * 6 }
        S.fish.set(name, f)
      }
      return f
    }
    const ripple = (x: number, y: number, color: string) => S.rings.push({ x, y, r: 4 * dpr, a: 0.9, color })

    const ingest = () => {
      const list = evRef.current
      if (list.length < S.seen) {
        // replay restarted
        S.fish.clear(); S.bubbles = []; S.rings = []; S.seen = 0; S.hookDown = false
      }
      for (; S.seen < list.length; S.seen++) {
        const e = list[S.seen]
        const lane = laneOf(e.persona)
        if (e.kind === 'graduate') {
          S.hookDown = true
          S.flash = 1
          continue
        }
        if (!lane || !e.bot) continue
        const f = fishFor(e.bot, lane)
        f.glow = 1
        f.seen = 1
        if (e.kind === 'buy' || e.kind === 'swap') {
          f.state = 'holding'
          f.size = Math.min(1, f.size + 0.35)
          f.tx = GATE + 0.08 + Math.random() * 0.4
          f.ty = lane.y + (Math.random() - 0.5) * 0.06
        } else if (e.kind === 'sell') {
          f.state = 'gone'
          f.tx = 1.08
          for (let i = 0; i < 6; i++) S.bubbles.push({ x: f.x * W, y: f.y * H, vy: -(0.4 + Math.random()) * dpr, r: (1.5 + Math.random() * 2) * dpr, a: 0.7 })
        } else if (e.kind === 'blocked') {
          f.kick = 1
          f.x = Math.max(0.05, GATE - 0.24)
          f.tx = GATE - 0.012 // rushes the line…
          ripple(GATE * W, f.y * H, '#f6b955')
        } else if (e.kind === 'claim') {
          for (let i = 0; i < 9; i++) S.bubbles.push({ x: f.x * W + (Math.random() - 0.5) * 24 * dpr, y: f.y * H, vy: -(0.6 + Math.random() * 1.2) * dpr, r: (1.5 + Math.random() * 3) * dpr, a: 0.9 })
          ripple(f.x * W, f.y * H, '#6ee7c4')
        }
      }
    }

    const draw = (t: number) => {
      ingest()
      ctx.clearRect(0, 0, W, H)
      const gx = GATE * W

      // lane guides + labels
      ctx.font = `${10 * dpr}px ui-monospace, monospace`
      for (const l of LANES) {
        ctx.fillStyle = 'rgba(143,181,176,0.07)'
        ctx.fillRect(0, l.y * H - 1, W, 1)
        ctx.fillStyle = 'rgba(143,181,176,0.45)'
        ctx.fillText(l.label, 8 * dpr, l.y * H - 7 * dpr)
      }

      // the hook's rule line
      const lineA = S.hookDown ? 0.0 : 0.55 + 0.15 * Math.sin(t / 500)
      if (lineA > 0.01) {
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, `rgba(246,185,85,${lineA * 0.1})`)
        g.addColorStop(0.5, `rgba(246,185,85,${lineA})`)
        g.addColorStop(1, `rgba(246,185,85,${lineA * 0.1})`)
        ctx.fillStyle = g
        ctx.fillRect(gx - dpr, 0, 2 * dpr, H)
        ctx.fillStyle = `rgba(246,185,85,${lineA})`
        ctx.fillText('the hook', gx + 8 * dpr, 12 * dpr)
      } else {
        ctx.fillStyle = 'rgba(110,231,196,0.5)'
        ctx.fillText('hook revoked: free water', gx + 8 * dpr, 12 * dpr)
      }
      if (S.flash > 0.01) {
        ctx.fillStyle = `rgba(110,231,196,${S.flash * 0.18})`
        ctx.fillRect(0, 0, W, H)
        S.flash *= still ? 0 : 0.96
      }

      // fish
      for (const f of S.fish.values()) {
        const k = still ? 1 : 0.07
        f.x += (f.tx - f.x) * k
        f.y += (f.ty - f.y) * k
        if (f.state === 'waiting') f.ty = f.lane.y + Math.sin(t / 1200 + f.phase) * 0.012
        else if (f.state === 'holding') f.ty = f.lane.y + Math.sin(t / 1500 + f.phase) * 0.018
        if (f.kick > 0.02) {
          // after reaching the line, get thrown back
          if (Math.abs(f.tx - (GATE - 0.012)) < 0.002 && Math.abs(f.x - f.tx) < 0.02) f.tx = Math.max(0.05, GATE - 0.22 - Math.random() * 0.05)
          f.kick *= 0.97
        }
        f.glow *= 0.965
        const x = f.x * W + (f.kick > 0.3 ? Math.sin(t / 25) * 2.5 * dpr * f.kick : 0)
        const y = f.y * H
        const fade = f.state === 'gone' ? Math.max(0, 1.08 - f.x) / 0.5 : f.state === 'waiting' ? 0.45 : 1
        const r = (4.5 + f.size * 4.5) * dpr
        const dir = f.tx > f.x + 0.003 ? 1 : f.tx < f.x - 0.003 ? -1 : f.state === 'holding' ? 1 : 1
        if (f.glow > 0.04) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5)
          g.addColorStop(0, f.lane.color + Math.floor(f.glow * 90).toString(16).padStart(2, '0'))
          g.addColorStop(1, f.lane.color + '00')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(x, y, r * 5, 0, 6.283)
          ctx.fill()
        }
        ctx.globalAlpha = Math.max(0.05, Math.min(1, fade))
        ctx.fillStyle = f.lane.color
        // body + tail (a small fish)
        ctx.beginPath()
        ctx.ellipse(x, y, r * 1.35, r, 0, 0, 6.283)
        ctx.fill()
        const wag = Math.sin(t / 120 + f.phase) * r * 0.35
        ctx.beginPath()
        ctx.moveTo(x - dir * r * 1.2, y)
        ctx.lineTo(x - dir * r * 2.2, y - r * 0.9 + wag)
        ctx.lineTo(x - dir * r * 2.2, y + r * 0.9 + wag)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#031014'
        ctx.beginPath()
        ctx.arc(x + dir * r * 0.65, y - r * 0.2, r * 0.18, 0, 6.283)
        ctx.fill()
        ctx.globalAlpha = 1
        if (f.seen > 0.02) {
          ctx.fillStyle = `rgba(231,245,239,${Math.min(1, f.seen)})`
          ctx.fillText(f.name, x - r, y - r * 1.9)
          f.seen *= 0.985
        }
      }

      // ripples + bubbles
      for (const r of S.rings) {
        r.r += 1.6 * dpr
        r.a *= 0.955
        ctx.strokeStyle = r.color + Math.floor(r.a * 255).toString(16).padStart(2, '0')
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.r, 0, 6.283)
        ctx.stroke()
      }
      S.rings = S.rings.filter((r) => r.a > 0.03)
      for (const b of S.bubbles) {
        b.y += b.vy
        b.a *= 0.985
        ctx.strokeStyle = `rgba(190,255,235,${b.a})`
        ctx.lineWidth = dpr
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, 6.283)
        ctx.stroke()
      }
      S.bubbles = S.bubbles.filter((b) => b.a > 0.05 && b.y > -10)
    }
    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)
    const vis = () => {
      cancelAnimationFrame(raf)
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  return (
    <div className="card overflow-hidden p-0">
      <canvas ref={canvasRef} className="block h-[19rem] w-full sm:h-[22rem]" role="img" aria-label="Animated tank: each bot is a fish; blocked attempts bounce off the hook's line" />
    </div>
  )
}
