/**
 * A kelp that grows as launch transactions confirm. `done` of `total` steps: the root appears first,
 * the stalk lengthens and fronds unfurl with each step, and the tip glows when the launch is complete.
 */
export function GrowingKelp({ done, total, failed = false }: { done: number; total: number; failed?: boolean }) {
  const p = total > 0 ? done / total : 0
  const complete = total > 0 && done >= total
  const col = failed ? '#f27c6b' : '#6ee7c4'
  // stalk: gentle S-curve from the root (y=170) to the tip (y=18)
  const stalk = 'M60 168 C48 140 74 118 58 92 C46 70 70 52 60 18'
  const fronds: [number, number, number][] = [ // x, y along the stalk, direction
    [53, 138, -1], [66, 116, 1], [55, 94, -1], [67, 72, 1], [58, 52, -1], [62, 34, 1],
  ]
  return (
    <svg viewBox="0 0 120 190" width="120" height="190" role="img" aria-label={`Launch ${done} of ${total} steps confirmed`} className="shrink-0">
      <defs>
        <linearGradient id="gk" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#137a6a" />
          <stop offset="1" stopColor={failed ? '#f27c6b' : '#9bd96b'} />
        </linearGradient>
        <filter id="gk-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* rock */}
      <path d="M8 190 L18 178 L44 182 L60 174 L84 181 L104 176 L116 190 Z" fill="#0d2c36" stroke="#164350" />
      {/* holdfast: appears once the first step is under way */}
      <g stroke="url(#gk)" strokeWidth="2.2" strokeLinecap="round" fill="none" style={{ opacity: done > 0 || p > 0 ? 1 : 0.25, transition: 'opacity .6s' }}>
        <path d="M60 170 C52 174 46 176 40 181" />
        <path d="M60 170 C57 176 55 179 54 184" />
        <path d="M60 170 C64 175 69 178 74 182" />
        <path d="M60 170 C68 172 76 172 82 177" />
      </g>
      {/* stalk */}
      <path d={stalk} fill="none" stroke="url(#gk)" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0.04, p)} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)' }} />
      {/* fronds unfurl in order */}
      {fronds.map(([x, y, d], i) => {
        const on = p >= (i + 1) / fronds.length - 0.001
        return (
          <path
            key={i}
            d={`M${x} ${y} q ${d * 22} -10 ${d * 30} 6 q ${-d * 14} -2 ${-d * 30} -6z`}
            fill="url(#gk)"
            style={{ transformOrigin: `${x}px ${y}px`, transform: on ? 'scale(1)' : 'scale(0)', opacity: on ? 0.95 : 0, transition: 'transform .7s cubic-bezier(.2,1.4,.4,1), opacity .5s' }}
          />
        )
      })}
      {complete && <circle cx="60" cy="16" r="6" fill={col} filter="url(#gk-glow)" />}
      {complete && <circle cx="60" cy="16" r="3" fill="#fff" />}
    </svg>
  )
}
