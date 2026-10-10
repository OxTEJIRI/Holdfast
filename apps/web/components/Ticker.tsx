/** A slow marquee of real facts from the recorded Arena run. Pure CSS; static under reduced motion. */
export function Ticker({ items }: { items: string[] }) {
  const row = (
    <ul className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-10 whitespace-nowrap text-xs uppercase tracking-[0.16em] text-muted">
          {t}
          <span aria-hidden className="h-1 w-1 rounded-full bg-teal/60" />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="relative -mx-4 overflow-hidden border-y border-teal/10 bg-ink/40 py-3 backdrop-blur [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]" aria-label="Arena highlights">
      <div className="flex w-max animate-[marquee_60s_linear_infinite] hover:[animation-play-state:paused]">
        {row}
        <div aria-hidden>{row}</div>
      </div>
    </div>
  )
}
