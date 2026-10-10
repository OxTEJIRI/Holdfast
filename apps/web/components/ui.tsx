import type { ReactNode } from 'react'

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`num display mt-1 text-2xl font-bold tracking-tight ${accent ? 'text-grad' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  kind = 'primary',
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  kind?: 'primary' | 'ghost' | 'warn'
  className?: string
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'bg-gradient-to-br from-teal to-kelp text-ink shadow-[0_0_28px_-8px_rgba(110,231,196,0.7)] hover:brightness-110',
    ghost: 'border border-teal/20 bg-panel-2/70 text-fg hover:border-teal/60',
    warn: 'bg-amber text-ink hover:brightness-110',
  }[kind]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-11 rounded-xl px-5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="display text-sm font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Bar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-line ${className}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-teal to-kelp shadow-[0_0_12px_rgba(110,231,196,0.6)] transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}
