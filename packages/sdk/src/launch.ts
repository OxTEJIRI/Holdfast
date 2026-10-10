/**
 * Launch transaction sequence (DESIGN.md §6.1):
 *   Tx A  DFS initialize_fee_vault_pda (DFS mode only)
 *   Tx B  DBC createConfigWithTransferHook (fee claimer = DFS vault, or the keeper)
 *   Tx C  DBC createPoolWithTransferHook → Holdfast init_launch → creator ATA + register (atomic)
 *   Tx D  optional creator first buy (built after Tx C lands: the launch tx is ~1155/1232 bytes)
 *
 * Steps are builders, not prebuilt transactions: the DBC SDK reads the config account from chain
 * when building the pool transaction, so each step is built after the previous one confirms.
 */
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DynamicFeeSharingClient, deriveFeeVaultPdaAddress } from '@meteora-ag/dynamic-fee-sharing-sdk'
import { HOLDFAST_PROGRAM_ID, type Network } from './constants'
import { initLaunchIx, registerIxs } from './instructions'
import { launchPda, rewardsAuthorityPda } from './pda'
import { type HoldfastPreset, type PresetId, type PresetOverrides, type ResolvedPreset, buildHoldfastConfig, resolvePreset } from './presets'
import { buy } from './trade'

/** 'dfs': DBC fees route through a Meteora Dynamic Fee Sharing vault (trustless; mainnet).
 *  'keeper': a keeper wallet is the DBC fee claimer and deposits the holders' share (devnet fallback, VERIFICATION.md V6). */
export type FeeMode = 'dfs' | 'keeper'

export const defaultFeeMode = (network: Network): FeeMode => (network === 'devnet' ? 'keeper' : 'dfs')

export type LaunchStep = {
  label: string
  /**
   * Builds the step's transaction (feePayer set, no blockhash). Call only after the previous step has
   * confirmed: the DBC builders read the config account from chain.
   */
  build: () => Promise<Transaction>
  /** ephemeral keypairs the SDK generated (config, mint) that must also sign */
  signers: Keypair[]
}

export type CreateLaunchParams = {
  creator: PublicKey
  /** pays rent and fees; defaults to the creator */
  payer?: PublicKey
  name: string
  symbol: string
  uri: string
  preset: HoldfastPreset | PresetId
  overrides?: PresetOverrides
  network: Network
  treasury: PublicKey
  feeMode?: FeeMode
  /** keeper mode: the DBC fee claimer (defaults to the payer) */
  keeper?: PublicKey
  /** creator's first buy in SOL; build it with `prepared.buildFirstBuy()` once Tx C has landed */
  firstBuySol?: number
  /** use this keypair for the new mint (e.g. to put the mint address in the metadata uri); default: random */
  mintKeypair?: Keypair
}

export type PreparedLaunch = {
  mint: PublicKey
  config: PublicKey
  pool: PublicKey
  launch: PublicKey
  /** DFS fee vault, or PublicKey.default in keeper mode */
  feeVault: PublicKey
  feeMode: FeeMode
  preset: ResolvedPreset
  /** send in order: build → sign (payer/creator + step.signers) → confirm → next */
  steps: LaunchStep[]
  /** Tx D (only if `firstBuySol`): build after Tx C confirms */
  buildFirstBuy?: () => Promise<Transaction>
}

/** Builds the full launch sequence. Send `steps` in order; each must confirm before the next. */
export async function createLaunch(conn: Connection, p: CreateLaunchParams): Promise<PreparedLaunch> {
  const payer = p.payer ?? p.creator
  const feeMode = p.feeMode ?? defaultFeeMode(p.network)
  const resolved = resolvePreset(p.preset, p.overrides, p.network)
  const configKp = Keypair.generate()
  const mintKp = p.mintKeypair ?? Keypair.generate()
  const mint = mintKp.publicKey
  const config = configKp.publicKey
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint, config)
  const feeVault = feeMode === 'dfs' ? deriveFeeVaultPdaAddress(config, NATIVE_MINT) : PublicKey.default
  const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
  const withPayer = async (tx: Promise<Transaction>) => {
    const t = await tx
    t.feePayer = payer
    return t
  }
  const steps: LaunchStep[] = []

  if (feeMode === 'dfs') {
    const dfs = new DynamicFeeSharingClient(conn, 'confirmed')
    steps.push({
      label: 'Create fee-sharing vault',
      build: () => withPayer(dfs.createFeeVaultPda({
        base: config, tokenMint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID, owner: p.creator, payer,
        userShare: [
          // index 0 = Holdfast rewards PDA (sync_rewards claims index 0)
          { address: rewardsAuthorityPda(mint), share: resolved.split.holders },
          { address: p.creator, share: resolved.split.creator },
          { address: p.treasury, share: resolved.split.treasury },
        ],
      })),
      signers: [configKp],
    })
  }

  steps.push({
    label: 'Create bonding-curve config',
    build: () => withPayer(dbc.partner.createConfigWithTransferHook({
      ...buildHoldfastConfig(p.preset, p.overrides, { network: p.network }),
      config, feeClaimer: feeMode === 'dfs' ? feeVault : (p.keeper ?? payer), leftoverReceiver: p.treasury,
      payer, quoteMint: NATIVE_MINT, transferHookProgram: HOLDFAST_PROGRAM_ID,
    })),
    signers: [configKp],
  })

  steps.push({
    label: 'Create pool + Holdfast launch',
    build: async () => {
      const poolTx = await dbc.creator.createPoolWithTransferHook({
        baseMint: mint, config, name: p.name, symbol: p.symbol, uri: p.uri, payer, poolCreator: p.creator,
        transferHookProgram: HOLDFAST_PROGRAM_ID,
      })
      poolTx.add(
        await initLaunchIx(conn, { mint, pool, config, creator: p.creator, payer, rules: resolved.rules, feeVault }),
        ...(await registerIxs(conn, mint, p.creator, payer)),
      )
      poolTx.feePayer = payer
      return poolTx
    },
    signers: [mintKp],
  })

  const firstBuySol = p.firstBuySol
  return {
    mint, config, pool, launch: launchPda(mint), feeVault, feeMode, preset: resolved, steps,
    buildFirstBuy: firstBuySol ? () => buy(conn, { owner: p.creator, mint, solIn: firstBuySol }) : undefined,
  }
}
