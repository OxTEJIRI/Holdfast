/** Returns the bots' remaining SOL to the wallet after a run. */
import { SystemProgram, Transaction } from '@solana/web3.js'
import { conn, loadBots, send, sol, wallet } from './lib'

async function main() {
  let total = 0
  for (const b of loadBots()) {
    const bal = await conn.getBalance(b.kp.publicKey)
    const lamports = bal - 5000
    if (lamports <= 0) continue
    await send(async () => {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: b.kp.publicKey, toPubkey: wallet.publicKey, lamports }))
      tx.feePayer = b.kp.publicKey
      return tx
    }, [b.kp])
    total += lamports
  }
  console.log(`swept ${sol(total).toFixed(4)} SOL back to ${wallet.publicKey.toBase58()}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
