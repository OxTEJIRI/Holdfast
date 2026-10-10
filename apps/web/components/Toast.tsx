'use client'
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react'
import { explorer } from '@/lib/config'

type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string; sig?: string }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((xs) => [...xs, { ...t, id }])
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.kind === 'error' ? 9000 : 6000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`rise rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error' ? 'border-red/40 bg-[#2a1614] text-red' : t.kind === 'ok' ? 'border-teal/40 bg-teal-soft/60 text-fg' : 'border-line bg-panel-2 text-fg'
            }`}
          >
            <div>{t.text}</div>
            {t.sig && (
              <a className="mt-1 inline-block text-xs text-teal underline" href={explorer('tx', t.sig)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
