'use client'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Keypair, PublicKey, type Transaction } from '@solana/web3.js'
import {
  CAPS, type PreparedLaunch, type PresetId, type PresetOverrides, TOTAL_SUPPLY_TOKENS, buildHoldfastConfig, createLaunch, explainError,
  presets, protectionEndsAfterSecs, resolvePreset,
} from '@holdfast/sdk'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { celebrate } from '@/components/Celebrate'
import { GrowingKelp } from '@/components/GrowingKelp'
import { Button, Section } from '@/components/ui'
import { NETWORK, explorer } from '@/lib/config'
import { curvePoints } from '@/lib/curve'
import { clock } from '@/lib/format'
import { sendWithWallet } from '@/lib/send'

const STEPS = ['Token', 'Preset', 'Rules', 'Fees', 'Curve', 'Launch'] as const
const AVATARS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
type Progress = { label: string; status: 'pending' | 'active' | 'done' | 'failed'; sig?: string; error?: string }

export function LaunchWizard() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [avatar, setAvatar] = useState('a1')
  const [imageUrl, setImageUrl] = useState('')
  const [presetId, setPresetId] = useState<PresetId>('fairLaunch')
  const base = presets[presetId]
  const [rules, setRules] = useState(base.rules)
  const [threshold, setThreshold] = useState(NETWORK === 'mainnet' ? base.thresholdSol.mainnet : base.thresholdSol.devnet)
  const [split, setSplit] = useState(base.split)
  const [treasury, setTreasury] = useState('')
  const [firstBuy, setFirstBuy] = useState('')
  const [progress, setProgress] = useState<Progress[]>([])
  const [launched, setLaunched] = useState<PreparedLaunch>()
  const [running, setRunning] = useState(false)

  const pickPreset = (id: PresetId) => {
    setPresetId(id)
    setRules(presets[id].rules)
    setThreshold(NETWORK === 'mainnet' ? presets[id].thresholdSol.mainnet : presets[id].thresholdSol.devnet)
    setSplit(presets[id].split)
  }

  const overrides: PresetOverrides = { rules, thresholdSol: threshold, split }
  const validation = useMemo(() => {
    try {
      resolvePreset(presetId, overrides, NETWORK)
      return undefined
    } catch (e) {
      return (e as Error).message
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, rules, threshold, split])
  const curve = useMemo(() => {
    if (validation) return []
    try {
      return curvePoints(buildHoldfastConfig(presetId, overrides, { network: NETWORK }), TOTAL_SUPPLY_TOKENS)
    } catch {
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, rules, threshold, split, validation])

  const tokenError =
    !name.trim() ? 'Give your token a name' : name.length > 32 ? 'Name: 32 characters max' : !/^[A-Za-z0-9]{1,10}$/.test(symbol) ? 'Symbol: 1–10 letters or digits' : imageUrl && !/^https:\/\/\S{8,150}$/.test(imageUrl) ? 'Image must be an https URL (150 chars max)' : undefined
  const treasuryKey = useMemo(() => {
    try {
      return treasury ? new PublicKey(treasury) : wallet.publicKey
    } catch {
      return null
    }
  }, [treasury, wallet.publicKey])
  const blocker = [tokenError, undefined, validation, validation ?? (treasuryKey === null ? 'Treasury is not a valid address' : undefined), undefined, undefined][step]

  async function launch() {
    if (!wallet.publicKey) return setVisible(true)
    setRunning(true)
    try {
      let prepared = launched
      let list = progress
      if (!prepared) {
        const mintKeypair = Keypair.generate()
        const qs = new URLSearchParams({ n: name.trim(), s: symbol.toUpperCase(), i: imageUrl || avatar, h: String(split.holders) })
        const uri = `${window.location.origin}/api/metadata/${mintKeypair.publicKey.toBase58()}?${qs}`
        if (uri.length > 200) throw new Error('Metadata link too long: shorten the name or image URL')
        prepared = await createLaunch(connection, {
          creator: wallet.publicKey, name: name.trim(), symbol: symbol.toUpperCase(), uri, preset: presetId, overrides, network: NETWORK,
          treasury: treasuryKey!, keeper: wallet.publicKey, mintKeypair, firstBuySol: Number(firstBuy) > 0 ? Number(firstBuy) : undefined,
        })
        setLaunched(prepared)
        list = [...prepared.steps.map((s) => ({ label: s.label, status: 'pending' as const })), ...(prepared.buildFirstBuy ? [{ label: `First buy (${firstBuy} SOL)`, status: 'pending' as const }] : [])]
        setProgress(list)
      }
      const jobs: { build: () => Promise<Transaction>; signers: Keypair[] }[] = [
        ...prepared.steps.map((s) => ({ build: s.build, signers: s.signers })),
        ...(prepared.buildFirstBuy ? [{ build: prepared.buildFirstBuy, signers: [] }] : []),
      ]
      for (let i = 0; i < jobs.length; i++) {
        if (list[i].status === 'done') continue
        list = list.map((p, j) => (j === i ? { ...p, status: 'active', error: undefined } : p))
        setProgress(list)
        try {
          const sig = await sendWithWallet(connection, wallet, await jobs[i].build(), jobs[i].signers)
          list = list.map((p, j) => (j === i ? { ...p, status: 'done', sig } : p))
          setProgress(list)
        } catch (e) {
          list = list.map((p, j) => (j === i ? { ...p, status: 'failed', error: explainError(e) } : p))
          setProgress(list)
          return
        }
      }
    } catch (e) {
      setProgress((xs) => [...xs, { label: 'Prepare launch', status: 'failed', error: explainError(e) }])
    } finally {
      setRunning(false)
    }
  }
  const allDone = progress.length > 0 && progress.every((p) => p.status === 'done')
  const celebrated = useRef(false)
  useEffect(() => {
    if (allDone && !celebrated.current) {
      celebrated.current = true
      celebrate({ text: 'Launched', sub: `${symbol.toUpperCase()} is live` })
    }
  }, [allDone, symbol])

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => !running && !launched && i <= step && setStep(i)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === step ? 'bg-panel-2 text-fg' : i < step ? 'text-muted' : 'text-faint'}`}
            >
              <span className={`num grid h-6 w-6 place-items-center rounded-full text-xs ${i < step ? 'bg-teal text-ink' : i === step ? 'border border-teal text-teal' : 'border border-line'}`}>
                {i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-6">
        {step === 0 && (
          <Section title="Your token">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="32 characters max">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className={input} placeholder="Patient Capital" />
              </Field>
              <Field label="Symbol" hint="letters and digits">
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10))} className={input} placeholder="STAY" />
              </Field>
            </div>
            <div className="mt-5 text-xs uppercase tracking-wider text-muted">Image</div>
            <div className="mt-2 flex flex-wrap gap-3">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAvatar(a)
                    setImageUrl('')
                  }}
                  className={`rounded-2xl border-2 p-0.5 ${avatar === a && !imageUrl ? 'border-teal' : 'border-transparent'}`}
                  aria-label={`avatar ${a}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/tokens/${a}.svg`} alt="" className="h-12 w-12 rounded-xl" />
                </button>
              ))}
            </div>
            <Field label="…or an image URL" hint="https, optional">
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value.trim())} className={input} placeholder="https://…" />
            </Field>
          </Section>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(presets) as PresetId[]).map((id) => {
              const p = presets[id]
              return (
                <button key={id} onClick={() => pickPreset(id)} className={`card p-5 text-left transition ${presetId === id ? 'border-teal' : 'hover:border-teal/40'}`}>
                  <div className="display text-xl font-bold">{p.name}</div>
                  <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                  <div className="mt-4" aria-hidden>
                    <div className="flex h-3 overflow-hidden rounded-full bg-ink">
                      <div className="bg-amber" style={{ width: `${(p.rules.windowSecs / 2400) * 100}%` }} />
                      <div className="bg-amber/40" style={{ width: `${(p.rules.snipeLockSecs / 2400) * 100}%` }} />
                      <div className="flex-1 bg-teal/60" />
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-faint">window · lock · free trading (40 min scale)</div>
                  </div>
                  <dl className="num mt-4 space-y-1 text-xs text-muted">
                    <Row k="Anti-sniper fee" v={`${p.fee.startBps / 100}% → ${p.fee.endBps / 100}% over ${p.fee.durationSecs}s`} />
                    <Row k="Window / lock" v={`${clock(p.rules.windowSecs)} / ${clock(p.rules.snipeLockSecs)}`} />
                    <Row k="Max wallet" v={`${p.rules.maxWalletBps / 100}%`} />
                    <Row k="Graduates at" v={`${NETWORK === 'mainnet' ? p.thresholdSol.mainnet : p.thresholdSol.devnet} SOL`} />
                    <Row k="Holders / creator / treasury" v={`${p.split.holders} / ${p.split.creator} / ${p.split.treasury}`} />
                  </dl>
                </button>
              )
            })}
          </div>
        )}

        {step === 2 && (
          <Section title="Protection rules" aside={<span className="text-xs text-muted">clamped to the program’s hard caps</span>}>
            <Slider label="Opening window" value={rules.windowSecs} min={0} max={CAPS.maxWindowSecs} step={15} fmt={clock} onChange={(v) => setRules({ ...rules, windowSecs: v })} />
            <Slider label="Snipe-lock" value={rules.snipeLockSecs} min={0} max={CAPS.maxSnipeLockSecs} step={30} fmt={clock} onChange={(v) => setRules({ ...rules, snipeLockSecs: v })} />
            <Slider
              label="Max wallet in the window"
              value={rules.maxWalletBps}
              min={0}
              max={1000}
              step={10}
              fmt={(v) => (v === 0 ? 'off' : `${v / 100}%`)}
              onChange={(v) => setRules({ ...rules, maxWalletBps: v === 0 ? 0 : Math.max(CAPS.minMaxWalletBps, v) })}
            />
            <Slider label="Graduation threshold" value={threshold} min={0.5} max={NETWORK === 'mainnet' ? 500 : 20} step={0.5} fmt={(v) => `${v} SOL`} onChange={setThreshold} />
            <p className="mt-4 rounded-xl border border-teal/30 bg-teal-soft/30 p-3 text-sm">
              The hook can only reject transfers for the first <span className="num font-semibold">{clock(protectionEndsAfterSecs(rules))}</span> after
              launch (40 minutes at most). After that, nothing can block a sale.
            </p>
          </Section>
        )}

        {step === 3 && (
          <Section title="Where the fees go">
            <Slider label="Holders (by conviction)" value={split.holders} min={50} max={100} step={5} fmt={(v) => `${v}%`} onChange={(v) => {
              const rest = 100 - v
              const creator = Math.min(split.creator, rest)
              setSplit({ holders: v, creator, treasury: rest - creator })
            }} />
            <Slider label="Creator" value={split.creator} min={0} max={100 - split.holders} step={5} fmt={(v) => `${v}%`} onChange={(v) => setSplit({ ...split, creator: v, treasury: 100 - split.holders - v })} />
            <div className="num mt-2 text-sm text-muted">Treasury: {split.treasury}%</div>
            <Field label="Treasury address" hint="defaults to your wallet">
              <input value={treasury} onChange={(e) => setTreasury(e.target.value.trim())} className={input} placeholder={wallet.publicKey?.toBase58() ?? 'your wallet'} />
            </Field>
            <p className="mt-4 text-sm text-muted">
              {NETWORK === 'devnet'
                ? 'On devnet your wallet is the fee keeper: after graduation you press “Route fees to holders” to deposit their share. On mainnet a Meteora Dynamic Fee Sharing vault does this trustlessly.'
                : 'Fees route through a Meteora Dynamic Fee Sharing vault: holders’ share goes to the Holdfast rewards account.'}
            </p>
          </Section>
        )}

        {step === 4 && (
          <Section title="Bonding curve" aside={<span className="text-xs text-muted">market cap vs SOL raised</span>}>
            {curve.length === 0 ? (
              <p className="text-sm text-red">{validation ?? 'Could not build the curve with these settings.'}</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curve} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="fillTeal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2bc7b0" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2bc7b0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1f2b2f" vertical={false} />
                    <XAxis dataKey="raised" type="number" tick={{ fill: '#8ba29e', fontSize: 12 }} tickFormatter={(v) => `${Number(v).toFixed(1)}`} unit=" SOL" />
                    <YAxis tick={{ fill: '#8ba29e', fontSize: 12 }} tickFormatter={(v) => Number(v).toFixed(0)} width={48} />
                    <Tooltip
                      contentStyle={{ background: '#10171a', border: '1px solid #1f2b2f', borderRadius: 12, color: '#e4eeec' }}
                      formatter={(v) => [`${Number(v ?? 0).toFixed(2)} SOL`, 'market cap']}
                      labelFormatter={(v) => `${Number(v).toFixed(2)} SOL raised`}
                    />
                    <Area dataKey="mcap" stroke="#2bc7b0" strokeWidth={2} fill="url(#fillTeal)" type="monotone" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-3 text-sm text-muted">
              Graduates at {threshold} SOL raised, then migrates to a Meteora DAMM v2 pool in Compounding mode with half the LP permanently locked for
              holders’ fees.
            </p>
          </Section>
        )}

        {step === 5 && (
          <Section title="Review and launch">
            <dl className="num grid gap-2 text-sm sm:grid-cols-2">
              <Row k="Token" v={`${name || '—'} ($${symbol || '—'})`} />
              <Row k="Preset" v={base.name} />
              <Row k="Window / lock" v={`${clock(rules.windowSecs)} / ${clock(rules.snipeLockSecs)}`} />
              <Row k="Max wallet" v={rules.maxWalletBps ? `${rules.maxWalletBps / 100}%` : 'off'} />
              <Row k="Graduates at" v={`${threshold} SOL`} />
              <Row k="Fee split" v={`${split.holders} / ${split.creator} / ${split.treasury}`} />
            </dl>
            <Field label="Your first buy (optional)" hint="SOL, sent after the launch">
              <input value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} inputMode="decimal" className={input} placeholder="0" disabled={!!launched} />
            </Field>
            {progress.length > 0 && (
              <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-end">
                <GrowingKelp done={progress.filter((p) => p.status === 'done').length} total={progress.length} failed={progress.some((p) => p.status === 'failed')} />
              <ol className="min-w-0 flex-1 space-y-2 self-stretch sm:self-center">
                {progress.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                        p.status === 'done' ? 'bg-teal text-ink' : p.status === 'failed' ? 'bg-red text-ink' : p.status === 'active' ? 'border border-amber text-amber' : 'border border-line text-faint'
                      }`}
                    >
                      {p.status === 'done' ? '✓' : p.status === 'failed' ? '!' : i + 1}
                    </span>
                    <span className="flex-1">
                      {p.label}
                      {p.status === 'active' && <span className="text-amber"> · confirm in your wallet…</span>}
                      {p.error && <span className="block text-xs text-red">{p.error}</span>}
                    </span>
                    {p.sig && (
                      <a className="text-xs text-teal underline" href={explorer('tx', p.sig)} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    )}
                  </li>
                ))}
              </ol>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {allDone && launched ? (
                <Link href={`/t/${launched.mint.toBase58()}`} className="inline-flex h-11 items-center rounded-xl bg-teal px-5 text-sm font-semibold text-ink">
                  Open your token
                </Link>
              ) : (
                <Button onClick={launch} disabled={running}>
                  {running ? 'Launching…' : !wallet.publicKey ? 'Connect a wallet' : progress.some((p) => p.status === 'failed') ? 'Retry' : `Launch (${progress.length || (NETWORK === 'devnet' ? 2 : 3) + (Number(firstBuy) > 0 ? 1 : 0)} signatures)`}
                </Button>
              )}
            </div>
          </Section>
        )}

        {step < 5 && (
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button kind="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button onClick={() => setStep(step + 1)} disabled={!!blocker}>
              Continue
            </Button>
            {blocker && <span className="text-sm text-amber">{blocker}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

const input = 'h-11 w-full rounded-xl border border-line bg-ink px-3 outline-none focus:border-teal'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="flex justify-between text-xs uppercase tracking-wider text-muted">
        {label}
        {hint && <span className="normal-case tracking-normal text-faint">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 py-1">
      <dt className="text-faint">{k}</dt>
      <dd className="text-right text-fg">{v}</dd>
    </div>
  )
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="mb-5 block">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="num text-teal">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-teal)]" />
    </label>
  )
}
