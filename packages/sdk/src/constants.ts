import { PublicKey } from '@solana/web3.js'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, MigrationFeeOption } from '@meteora-ag/dynamic-bonding-curve-sdk'

export type Network = 'mainnet' | 'devnet' | 'localnet'

export const HOLDFAST_PROGRAM_ID = new PublicKey('E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw')
export const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
/** PDA ["pool_authority"] under DBC; owns the pool vaults */
export const DBC_POOL_AUTHORITY = new PublicKey('FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM')
export const DFS_PROGRAM_ID = new PublicKey('dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh')
export const DFS_FEE_VAULT_AUTHORITY = new PublicKey('EYqHRdtepv1KKUkPAYMBYpSfiGfNd8sa55ZtswodTfBS')
export const DFS_EVENT_AUTHORITY = new PublicKey('EjRrm5Ptzzbp4fft5k4oC9LvbXqVA4UV4Sc9RNULDhCA')
/** DAMM v2 config for MigrationFeeOption.Customizable (every Holdfast launch migrates through it) */
export const DAMM_V2_CONFIG = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]

/** Program hard caps (DESIGN.md §3.2) */
export const CAPS = {
  maxWindowSecs: 600,
  maxSnipeLockSecs: 1800,
  minMaxWalletBps: 50,
} as const

export const TOKEN_DECIMALS = 6
export const TOTAL_SUPPLY_TOKENS = 1_000_000_000
export const TOTAL_SUPPLY = BigInt(TOTAL_SUPPLY_TOKENS) * 10n ** BigInt(TOKEN_DECIMALS)
/** Max transaction size; the launch tx (pool + init_launch + register) uses ~1155 bytes */
export const MAX_TX_BYTES = 1232
