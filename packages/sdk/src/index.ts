/**
 * @holdfast/sdk — add conviction-weighted holder rewards to a Meteora DBC launch.
 *
 *   const launch = await createLaunch(conn, { creator, name, symbol, uri, preset: 'fairLaunch', network: 'devnet', treasury })
 *   const tx = await buy(conn, { owner, mint: launch.mint, solIn: 0.1 })     // registers on first buy
 *   const txs = await crank(conn, { mint, signer })  ·  await claim(conn, { owner, mint })
 */
export * from './constants'
export * from './pda'
export * from './presets'
export * from './launch'
export * from './trade'
export * from './state'
export * from './rewards'
export * from './errors'
export * from './node'
export {
  claimIx,
  depositRewardsIxs,
  finalizeIx,
  initLaunchIx,
  registerIxs,
  syncRewardsIx,
  wsolAta,
} from './instructions'
export { IDL, holdfastProgram, type Holdfast, type HolderAccount, type LaunchAccount } from './program'
