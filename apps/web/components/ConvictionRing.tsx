import { useId } from 'react'

/**
 * The signature visual: a depth dial. The arc fills to the holder's share of all future rewards;
 * a glowing bead rides its tip. Amber when the wallet is snipe-locked.
 */
export function ConvictionRing({
  share,
  size = 200,
  locked = false,
  label,
  caption,
}: {
  share: number // 0..1
  size?: number
  locked?: boolean
  label: string
  caption?: string
}) {
  const id = useId().replace(/:/g, '')
  const stroke = Math.max(10, size / 15)
  const r = (size - stroke) / 2 - size * 0.045
  const c = 2 * Math.PI * r
  const fill = share > 0 ? Math.max(0.015, Math.min(1, share)) : 0
  const from = locked ? '#f6b955' : '#6ee7c4'
  const to = locked ? '#ffd88a' : '#9bd96b'
  const angle = fill * 2 * Math.PI - Math.PI / 2
  const bead = { x: size / 2 + r * Math.cos(angle), y: size / 2 + r * Math.sin(angle) }
  const ticks = 60
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={size / 40} />
          </filter>
        </defs>
        {/* dial ticks, like a depth gauge */}
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * 2 * Math.PI - Math.PI / 2
          const major = i % 5 === 0
          const r1 = size / 2 - 1
          const r2 = r1 - (major ? size * 0.035 : size * 0.02)
          const lit = i / ticks <= fill
          return (
            <line
              key={i}
              x1={size / 2 + r1 * Math.cos(a)}
              y1={size / 2 + r1 * Math.sin(a)}
              x2={size / 2 + r2 * Math.cos(a)}
              y2={size / 2 + r2 * Math.sin(a)}
              stroke={lit ? from : 'var(--color-line)'}
              strokeOpacity={lit ? 0.85 : 1}
              strokeWidth={major ? 1.6 : 1}
            />
          )
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} opacity={0.7} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {fill > 0 && (
            <>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={from} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${fill * c} ${c}`} filter={`url(#b${id})`} opacity={0.55} style={{ transition: 'stroke-dasharray 0.9s ease' }} />
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${fill * c} ${c}`} style={{ transition: 'stroke-dasharray 0.9s ease' }} />
            </>
          )}
        </g>
        {fill > 0 && <circle cx={bead.x} cy={bead.y} r={stroke * 0.32} fill="#fff" opacity={0.95} style={{ transition: 'cx 0.9s ease, cy 0.9s ease' }} />}
      </svg>
      <div className="absolute text-center">
        <div className="num display font-bold tracking-tight" style={{ fontSize: size / 4.6 }}>
          {label}
        </div>
        {caption && <div className="mx-auto mt-1 max-w-[70%] text-[11px] leading-snug text-muted">{caption}</div>}
      </div>
    </div>
  )
}
