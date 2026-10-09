import { AnchorProvider, Program, type IdlAccounts } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import idlJson from './idl/holdfast.json'
import type { Holdfast } from './idl/holdfast'

export type { Holdfast }
export type LaunchAccount = IdlAccounts<Holdfast>['launch']
export type HolderAccount = IdlAccounts<Holdfast>['holder']
export const IDL = idlJson as Holdfast

/** Read-only wallet: the SDK only builds instructions; callers sign. */
const readonlyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(): Promise<T> => {
    throw new Error('@holdfast/sdk does not sign')
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(): Promise<T[]> => {
    throw new Error('@holdfast/sdk does not sign')
  },
}

const cache = new WeakMap<Connection, Program<Holdfast>>()

/** Anchor client for the Holdfast program on `conn` (instruction building + account decoding). */
export function holdfastProgram(conn: Connection): Program<Holdfast> {
  let p = cache.get(conn)
  if (!p) {
    p = new Program<Holdfast>(IDL, new AnchorProvider(conn, readonlyWallet, { commitment: 'confirmed' }))
    cache.set(conn, p)
  }
  return p
}

export const programId = (conn: Connection): PublicKey => holdfastProgram(conn).programId
