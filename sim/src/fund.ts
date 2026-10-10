/** Creates the Arena bots (sim/.keys/, gitignored) and tops each up to its roster budget from the wallet. */
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js'
import { existsSync } from 'node:fs'
import { Bot, KEYS_FILE, NETWORK, ROSTER, conn, loadBots, saveBots, send, sol, wallet } from './lib'

async function main() {
  let bots: Bot[]
  if (existsSync(KEYS_FILE)) {
    bots = loadBots()
  } else {
    bots = ROSTER.flatMap(({ persona, count }) =>
      Array.from({ length: count }, (_, i) => ({ persona, name: count > 1 ? `${persona}-${i + 1}` : persona, kp: Keypair.generate() })),
    )
    saveBots(bots)
  }
  if (NETWORK === 'localnet' && (await conn.getBalance(wallet.publicKey)) < 50 * LAMPORTS_PER_SOL) {
    await conn.confirmTransaction(await conn.requestAirdrop(wallet.publicKey, 100 * LAMPORTS_PER_SOL), 'confirmed')
  }

  const budget = new Map(ROSTER.map((r) => [r.persona, r.fundSol]))
  const balances = await Promise.all(bots.map((b) => conn.getBalance(b.kp.publicKey)))
  const topUps = bots
    .map((b, i) => ({ b, lamports: Math.round(budget.get(b.persona)! * LAMPORTS_PER_SOL) - balances[i] }))
    .filter((x) => x.lamports > 0)
  const total = topUps.reduce((s, x) => s + x.lamports, 0)
  const have = await conn.getBalance(wallet.publicKey)
  console.log(`${bots.length} bots on ${NETWORK}; topping up ${topUps.length} with ${sol(total).toFixed(3)} SOL (wallet has ${sol(have).toFixed(3)})`)
  if (total > have - 0.05 * LAMPORTS_PER_SOL) throw new Error('Not enough SOL in the wallet')

  for (let i = 0; i < topUps.length; i += 8) {
    const chunk = topUps.slice(i, i + 8)
    await send(async () => new Transaction().add(
      ...chunk.map((x) => SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: x.b.kp.publicKey, lamports: x.lamports })),
    ), [wallet])
    console.log(`✔ funded ${chunk.map((x) => x.b.name).join(', ')}`)
  }
  console.log(`keys: ${KEYS_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
