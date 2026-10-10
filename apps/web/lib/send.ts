'use client'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import type { Connection, Keypair, Transaction } from '@solana/web3.js'

/**
 * Signs `tx` with the connected wallet (plus any SDK-generated keypairs, e.g. the new mint) and
 * sends it. Resolves once confirmed. Errors keep their program logs for `explainError`.
 */
export async function sendWithWallet(conn: Connection, wallet: WalletContextState, tx: Transaction, extraSigners: Keypair[] = []) {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Connect a wallet first')
  const latest = await conn.getLatestBlockhash('confirmed')
  tx.recentBlockhash = latest.blockhash
  tx.feePayer ??= wallet.publicKey
  if (extraSigners.length) tx.partialSign(...extraSigners)
  const signed = await wallet.signTransaction(tx)
  const sig = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed', maxRetries: 5 })
  // poll the status (public RPCs often refuse websocket subscriptions under load)
  for (let i = 0; i < 60; i++) {
    const { value } = await conn.getSignatureStatuses([sig]).catch(() => ({ value: [null] }))
    const st = value[0]
    if (st?.err) throw new Error(`Transaction failed: ${JSON.stringify(st.err)}`)
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') return sig
    if ((await conn.getBlockHeight('confirmed').catch(() => 0)) > latest.lastValidBlockHeight) break
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('The network was slow and the transaction expired: please retry.')
}
