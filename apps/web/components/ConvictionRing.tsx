/**
 * The signature visual: a ring filled to the holder's share of all future rewards.
 * The centre shows the share; the caption shows the raw conviction points.
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
  const stroke = Math.max(10, size / 14)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // tiny shares still get a visible sliver
  const fill = share > 0 ? Math.max(0.015, Math.min(1, share)) : 0
  const color = locked ? 'var(--color-amber)' : 'var(--color-teal)'
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {fill > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${fill * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />}
      </svg>
      <div className="absolute text-center">
        <div className="num font-semibold tracking-tight" style={{ fontSize: size / 5.2 }}>
          {label}
        </div>
        {caption && <div className="mt-1 text-xs text-muted">{caption}</div>}
      </div>
    </div>
  )
}
