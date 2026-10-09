/** Renders out/<run>.json as a Markdown tx table for docs/VERIFICATION.md. Usage: tsx src/report.ts out/devnet.json */
import { readFileSync } from 'node:fs'

const run = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  cluster: string
  startedAt: string
  keys: Record<string, string>
  steps: { step: string; ok: boolean; sig?: string; explorer?: string; note?: string }[]
}
const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`
const lines = [
  `Run: \`${run.cluster}\` at ${run.startedAt}`,
  '',
  '| # | Step | Result | Tx |',
  '|---|---|---|---|',
  ...run.steps.map((s, i) => {
    const tx = s.sig ? (run.cluster === 'devnet' ? `[${short(s.sig)}](${s.explorer})` : `\`${short(s.sig)}\``) : '—'
    const result = s.ok ? 'ok' : `**failed**: ${(s.note ?? '').split('\n')[0].replace(/\|/g, '\\|').slice(0, 120)}`
    return `| ${i + 1} | ${s.step.replace(/\|/g, '\\|')} | ${result} | ${tx} |`
  }),
  '',
  'Accounts:',
  '',
  ...Object.entries(run.keys).map(([k, v]) => `- ${k}: \`${v}\``),
]
console.log(lines.join('\n'))
