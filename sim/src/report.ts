/** Copies a finished run into docs/arena/<network>/ and renders README.md ("Who got paid?"). */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NETWORK, OUT_DIR, SIM_DIR } from './lib'

type Row = { persona: string; bots: number; investedSol: number; proceedsSol: number; rewardsSol: number; rewardsPerSol: number; blocked: Record<string, number> }
const summary = JSON.parse(readFileSync(join(OUT_DIR, 'summary.json'), 'utf8'))
const arena = JSON.parse(readFileSync(join(OUT_DIR, 'arena.json'), 'utf8'))
const dest = join(SIM_DIR, '..', 'docs', 'arena', NETWORK)
mkdirSync(dest, { recursive: true })
for (const f of ['events.jsonl', 'summary.json', 'arena.json']) copyFileSync(join(OUT_DIR, f), join(dest, f))

const label: Record<string, string> = {
  holder: 'Holders (buy small clips, never sell)', whale: 'Whale (8% after the window)', sniper: 'Snipers (buy at t+2 s, dump ASAP)',
  flipper: 'Flippers (buy after the window, sell 30–90 s later)', bundler: 'Bundler (+5 fresh wallets)', closer: 'Closer (completes the curve)',
}
const rows: Row[] = summary.personas
const fmt = (x: number, d = 4) => x.toFixed(d)
const lines = [
  `# Arena run (${NETWORK})`,
  '',
  `${summary.durationSecs} s, speed ${summary.speed}: window ${arena.windowSecs} s, snipe-lock ${arena.snipeLockSecs} s, max wallet ${arena.maxWalletBps / 100}%, ${arena.feeMode} fee mode.`,
  `Mint [\`${summary.mint}\`](${summary.explorer}). Produced by \`pnpm -C sim arena\` (sim/src/run.ts).`,
  '',
  '## Who got paid?',
  '',
  '| Persona | Bots | SOL in | SOL out (sells) | Rewards (SOL) | Rewards per SOL in | Blocked by Holdfast |',
  '|---|---:|---:|---:|---:|---:|---|',
  ...rows.map((r) => `| ${label[r.persona] ?? r.persona} | ${r.bots} | ${fmt(r.investedSol)} | ${fmt(r.proceedsSol)} | ${fmt(r.rewardsSol, 6)} | ${fmt(r.rewardsPerSol * 1000, 3)} mSOL | ${Object.entries(r.blocked).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'} |`),
  '',
  `- Holders vs flippers: **${summary.holdersVsFlippers}**; holders vs snipers: **${summary.holdersVsSnipers}** (rewards per SOL invested).`,
  `- Success metric (${summary.successMetric.rule}): **${summary.successMetric.met ? 'met' : 'NOT met'}**.`,
  `- Rewards paid: ${fmt(summary.rewardsPaidSol.round1BondingFees, 6)} SOL from bonding-curve fees, then ${fmt(summary.rewardsPaidSol.round2LpFees, 6)} SOL from post-graduation DAMM v2 LP fees.`,
  `- ${summary.blockedTotal} transfers were rejected by the hook, all inside the opening window or a snipe-lock.`,
  ...(() => {
    const quick = rows.filter((r) => (r.persona === 'sniper' || r.persona === 'flipper') && r.proceedsSol > r.investedSol)
    return quick.length
      ? [`- Honest note: ${quick.map((r) => r.persona + 's').join(' and ')} still sold for more than they paid (price appreciation). Holdfast doesn't stop that; it makes sure the launch's fee stream goes only to the people who stayed.`]
      : []
  })(),
  '',
  '## Key transactions',
  '',
  ...Object.entries(summary.keyTxs as Record<string, string>).map(([k, v]) => `- ${k}: ${v.startsWith('http') ? `[explorer](${v})` : `\`${v}\``}`),
  '',
  'Full event feed: `events.jsonl` (one JSON event per line; the web app\'s /arena page replays it).',
  '',
]
writeFileSync(join(dest, 'README.md'), lines.join('\n'))
console.log(`→ docs/arena/${NETWORK}/README.md`)
