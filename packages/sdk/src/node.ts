/** Node helpers for scripts and the simulation (sign with Keypairs and send). */
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import type { LaunchStep } from './launch'

/** The subset of `candidates` whose signatures `tx` requires. */
export function requiredSigners(tx: Transaction, candidates: Keypair[]): Keypair[] {
  // fee payer + every key an instruction marks as signer (no blockhash needed, unlike compileMessage)
  const needed = new Set<string>(tx.feePayer ? [tx.feePayer.toBase58()] : [])
  for (const ix of tx.instructions) for (const k of ix.keys) if (k.isSigner) needed.add(k.pubkey.toBase58())
  const seen = new Set<string>()
  return candidates.filter((k) => {
    const id = k.publicKey.toBase58()
    if (!needed.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Signs `tx` with whichever of `signers` it needs and sends it. Returns the signature. */
export async function sendTx(conn: Connection, tx: Transaction, signers: Keypair[]): Promise<string> {
  if (!tx.feePayer) tx.feePayer = signers[0].publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  return sendAndConfirmTransaction(conn, tx, requiredSigners(tx, signers), { commitment: 'confirmed' })
}

/** Sends launch steps in order. `wallets` = payer/creator keypairs. */
export async function sendSteps(conn: Connection, steps: LaunchStep[], wallets: Keypair[]): Promise<string[]> {
  const sigs: string[] = []
  for (const s of steps) sigs.push(await sendTx(conn, await s.build(), [...wallets, ...s.signers]))
  return sigs
}
