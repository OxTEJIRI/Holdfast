/**
 * Browser end-to-end check of the Phase 5 DoD on devnet (DESIGN.md §10): a fresh wallet can launch,
 * buy (auto-register), see conviction grow, hit a snipe-lock with a clear message, and claim after
 * graduation, all through the web UI.
 *
 *   NEXT_PUBLIC_ENABLE_BURNER=1 pnpm build && PORT=3100 pnpm start      # test build: burner wallet on
 *   pnpm e2e                                                            # BASE_URL=http://localhost:3100
 *
 * A burner wallet signs in the browser; the CLI wallet (~/.config/solana/id.json) funds it and plays
 * the "closer" who completes the curve. Needs Playwright's Chromium (LD_LIBRARY_PATH for missing libs).
 */
import { chromium, type Page } from 'playwright'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { buy, getLaunch, sendTx } from '@holdfast/sdk'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const conn = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed')
const cli = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), '.config/solana/id.json'), 'utf8'))))
const SHOTS = join(__dirname, '..', '..', '..', 'docs', 'screens')
mkdirSync(SHOTS, { recursive: true })
const results: Record<string, unknown> = { startedAt: new Date().toISOString() }

const step = (s: string) => console.log(`\n▶ ${s}`)
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
async function toast(page: Page, re: RegExp, timeout = 120_000) {
  const t = page.locator('[role=status], [role=alert]').filter({ hasText: re }).first()
  try {
    await t.waitFor({ timeout })
  } catch (e) {
    const shown = await page.locator('[role=alert], [role=status]').allTextContents()
    throw new Error(`expected a toast matching ${re}; saw: ${JSON.stringify(shown)}`)
  }
  const text = (await t.textContent()) ?? ''
  console.log(`  toast: ${text.replace(/View transaction$/, '').trim()}`)
  return text
}
async function pointsText(page: Page) {
  return (await page.locator('div:text-is("Points") + div').first().textContent())?.trim()
}

let failShot: () => Promise<unknown> = async () => {}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => console.log('  page error:', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  console.${m.type()}: ${m.text().slice(0, 300)}`)
  })
  failShot = () => shot(page, 'zz-failure')

  step('connect a fresh (burner) wallet')
  await page.goto(`${BASE}/launch`)
  await page.getByRole('button', { name: 'Select Wallet' }).click()
  await page.getByText('Burner Wallet').click()
  const addr = (await page.getByTestId('wallet-address').textContent({ timeout: 30_000 }))!
  results.wallet = addr
  console.log(`  wallet ${addr}`)
  await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: cli.publicKey, toPubkey: new PublicKey(addr), lamports: 0.4 * LAMPORTS_PER_SOL })), [cli])
  console.log('  funded with 0.4 SOL')

  step('launch wizard: token → Arena preset → rules → fees → curve → launch')
  await page.getByPlaceholder('Patient Capital').fill('E2E Patience')
  await page.getByPlaceholder('STAY').fill('E2E')
  await page.getByRole('button', { name: 'Continue' }).click()
  // Fair Launch: 2-minute window, 15-minute snipe-lock (room for a slow public RPC)
  await page.getByRole('button', { name: /Fair Launch/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await shot(page, '01-launch-rules')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(800)
  await shot(page, '02-launch-curve')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /^Launch \(/ }).click()
  await page.getByRole('link', { name: 'Open your token' }).waitFor({ timeout: 240_000 })
  await shot(page, '03-launch-done')
  await page.getByRole('link', { name: 'Open your token' }).click()
  await page.waitForURL(/\/t\//)
  const mint = new PublicKey(page.url().split('/t/')[1])
  results.mint = mint.toBase58()
  console.log(`  token page ${page.url()}`)

  step('buy 0.01 SOL in the opening window (registers the wallet)')
  await page.locator('#sol-in').waitFor({ timeout: 60_000 })
  await page.locator('#sol-in').fill('0.01')
  await page.getByRole('button', { name: 'Buy', exact: true }).click()
  results.buy = await toast(page, /Bought with 0\.01 SOL/)
  await page.waitForTimeout(6000)
  await shot(page, '04-bought')

  step('conviction grows')
  const p1 = await pointsText(page)
  await page.waitForTimeout(12_000)
  const p2 = await pointsText(page)
  console.log(`  points ${p1} → ${p2}`)
  results.points = { before: p1, after: p2 }
  if (!p1 || p1 === p2) throw new Error('points did not grow')

  step('try to sell inside the snipe-lock')
  await page.getByText('Unlocks in').waitFor({ timeout: 30_000 }) // the buy landed inside the window
  await page.getByRole('button', { name: 'sell' }).click()
  await page.getByRole('button', { name: 'Try to sell anyway' }).click()
  results.snipeLock = await toast(page, /Snipe-locked until \d\d:\d\d:\d\d/)
  await shot(page, '05-snipe-locked')

  step('the closer (CLI wallet) completes the curve → graduation')
  // a whale-sized buy is (correctly) refused by max-wallet during the opening window: wait it out
  const launch = (await getLaunch(conn, mint))!
  const wait = launch.windowEndsAt * 1000 - Date.now() + 3000
  if (wait > 0) {
    console.log(`  waiting ${Math.ceil(wait / 1000)} s for the opening window to close`)
    await page.waitForTimeout(wait)
  }
  const sig = await sendTx(conn, await buy(conn, { owner: cli.publicKey, mint, solIn: 3.6, partialFill: true, slippageBps: 2000 }), [cli])
  results.graduation = sig
  console.log(`  graduation tx ${sig}`)

  step('finalize, route fees, claim (as the fresh wallet, the launch’s keeper)')
  await page.getByRole('button', { name: 'Finalize' }).click({ timeout: 60_000 })
  results.finalize = await toast(page, /Finalized/)
  await page.getByRole('button', { name: 'Route fees to holders' }).click({ timeout: 60_000 })
  results.crank = await toast(page, /Fees routed to holders/)
  const claimBtn = page.getByRole('button', { name: /^Claim .* SOL$/ })
  await claimBtn.waitFor({ timeout: 60_000 })
  results.claimButton = await claimBtn.textContent()
  await claimBtn.click()
  results.claim = await toast(page, /Claimed .* SOL/)
  await page.waitForTimeout(6000)
  await shot(page, '06-claimed')

  step('migrate to DAMM v2')
  await page.getByRole('button', { name: 'Migrate to DAMM v2' }).click({ timeout: 60_000 })
  results.migrate = await toast(page, /Migrated to DAMM v2/)
  await page.waitForTimeout(6000)
  await shot(page, '07-migrated')

  results.finishedAt = new Date().toISOString()
  writeFileSync(join(SHOTS, 'e2e-result.json'), JSON.stringify(results, null, 2))
  console.log('\n✔ DoD flow passed in the browser')
  await browser.close()
}

main().catch(async (e) => {
  console.error('\n✘', e)
  await failShot().catch(() => {})
  writeFileSync(join(SHOTS, 'e2e-result.json'), JSON.stringify({ ...results, error: String(e) }, null, 2))
  process.exit(1)
})
