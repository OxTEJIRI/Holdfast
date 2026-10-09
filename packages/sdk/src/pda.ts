import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { HOLDFAST_PROGRAM_ID } from './constants'

const find = (seeds: Buffer[], program = HOLDFAST_PROGRAM_ID) => PublicKey.findProgramAddressSync(seeds, program)[0]

/** ["launch", mint] */
export const launchPda = (mint: PublicKey) => find([Buffer.from('launch'), mint.toBuffer()])
/** ["holder", token_account] — keyed by the token account key, never its data (DESIGN.md §5.3) */
export const holderPda = (tokenAccount: PublicKey) => find([Buffer.from('holder'), tokenAccount.toBuffer()])
/** ["rewards", mint] — owns the rewards vault; the DFS shareholder */
export const rewardsAuthorityPda = (mint: PublicKey) => find([Buffer.from('rewards'), mint.toBuffer()])
/** ["rewards_vault", mint] — quote-token account holders are paid from */
export const rewardsVaultPda = (mint: PublicKey) => find([Buffer.from('rewards_vault'), mint.toBuffer()])
/** ["extra-account-metas", mint] — Token-2022 transfer-hook account list */
export const extraAccountMetaListPda = (mint: PublicKey) => find([Buffer.from('extra-account-metas'), mint.toBuffer()])

/** The holder's Token-2022 ATA for a Holdfast mint (the only account `register` accepts). */
export const holderTokenAccount = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID)

/** Holder record PDA for an owner's ATA. */
export const holderPdaForOwner = (mint: PublicKey, owner: PublicKey) => holderPda(holderTokenAccount(mint, owner))
