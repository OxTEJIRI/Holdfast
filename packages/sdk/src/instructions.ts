/** Raw Holdfast instruction builders. Higher-level helpers live in launch/trade/rewards. */
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { deriveTokenVaultAddress } from '@meteora-ag/dynamic-fee-sharing-sdk'
import BN from 'bn.js'
import { DFS_EVENT_AUTHORITY, DFS_FEE_VAULT_AUTHORITY, DFS_PROGRAM_ID } from './constants'
import { holderPda, holderTokenAccount, launchPda, rewardsAuthorityPda, rewardsVaultPda } from './pda'
import { holdfastProgram } from './program'
import type { Rules } from './presets'

export const wsolAta = (owner: PublicKey) => getAssociatedTokenAddressSync(NATIVE_MINT, owner, true, TOKEN_PROGRAM_ID)

/** ATA (idempotent) + `register` for `owner`'s Token-2022 ATA. */
export async function registerIxs(conn: Connection, mint: PublicKey, owner: PublicKey, payer = owner): Promise<TransactionInstruction[]> {
  const tokenAccount = holderTokenAccount(mint, owner)
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, tokenAccount, owner, mint, TOKEN_2022_PROGRAM_ID),
    await holdfastProgram(conn).methods.register().accountsPartial({
      payer, owner, launch: launchPda(mint), mint, tokenAccount, holder: holderPda(tokenAccount),
      token2022Program: TOKEN_2022_PROGRAM_ID,
    }).instruction(),
  ]
}

/** Holdfast `init_launch`: must follow the DBC pool creation in the same transaction. */
export function initLaunchIx(conn: Connection, a: {
  mint: PublicKey; pool: PublicKey; config: PublicKey; creator: PublicKey; payer: PublicKey; rules: Rules; feeVault: PublicKey
}): Promise<TransactionInstruction> {
  return holdfastProgram(conn).methods
    .initLaunch({ windowSecs: a.rules.windowSecs, snipeLockSecs: a.rules.snipeLockSecs, maxWalletBps: a.rules.maxWalletBps, feeVault: a.feeVault })
    .accountsPartial({
      payer: a.payer, creator: a.creator, mint: a.mint, dbcPool: a.pool, dbcConfig: a.config,
      quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction()
}

/** Permissionless `finalize` (after the curve completes). */
export function finalizeIx(conn: Connection, mint: PublicKey, dbcPool: PublicKey): Promise<TransactionInstruction> {
  return holdfastProgram(conn).methods.finalize().accountsPartial({ launch: launchPda(mint), mint, dbcPool }).instruction()
}

/** DFS-mode crank: DFS claim_fee(index) signed by the rewards PDA, then distribute. */
export function syncRewardsIx(conn: Connection, mint: PublicKey, feeVault: PublicKey, index = 0): Promise<TransactionInstruction> {
  return holdfastProgram(conn).methods.syncRewards(index).accountsPartial({
    launch: launchPda(mint), rewardsAuthority: rewardsAuthorityPda(mint), rewardsVault: rewardsVaultPda(mint), quoteMint: NATIVE_MINT,
    dfsFeeVault: feeVault, dfsTokenVault: deriveTokenVaultAddress(feeVault), dfsFeeVaultAuthority: DFS_FEE_VAULT_AUTHORITY,
    dfsEventAuthority: DFS_EVENT_AUTHORITY, dfsProgram: DFS_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction()
}

/** Keeper mode: wrap `lamports` of SOL and deposit it as holder rewards. */
export async function depositRewardsIxs(conn: Connection, mint: PublicKey, depositor: PublicKey, lamports: bigint): Promise<TransactionInstruction[]> {
  const src = wsolAta(depositor)
  return [
    createAssociatedTokenAccountIdempotentInstruction(depositor, src, depositor, NATIVE_MINT, TOKEN_PROGRAM_ID),
    SystemProgram.transfer({ fromPubkey: depositor, toPubkey: src, lamports }),
    createSyncNativeInstruction(src, TOKEN_PROGRAM_ID),
    await holdfastProgram(conn).methods.depositRewards(new BN(lamports.toString())).accountsPartial({
      depositor, launch: launchPda(mint), rewardsVault: rewardsVaultPda(mint), depositorTokenAccount: src,
      quoteMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction(),
  ]
}

/** `claim` into `destination` (a wSOL token account of the owner's choosing). */
export function claimIx(conn: Connection, mint: PublicKey, owner: PublicKey, destination = wsolAta(owner)): Promise<TransactionInstruction> {
  return holdfastProgram(conn).methods.claim().accountsPartial({
    owner, launch: launchPda(mint), holder: holderPda(holderTokenAccount(mint, owner)), rewardsAuthority: rewardsAuthorityPda(mint),
    rewardsVault: rewardsVaultPda(mint), destination, quoteMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction()
}
