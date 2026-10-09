/**
 * Create a Holdfast launch from the command line — uses only @holdfast/sdk.
 *
 *   RPC_URL=https://api.devnet.solana.com pnpm create-launch --preset fairLaunch --name "My Token" --symbol MYT \
 *     --uri https://example.com/meta.json [--treasury <pubkey>] [--fee-mode dfs|keeper] [--first-buy 0.05]
 *
 * Signs with WALLET (default ~/.config/solana/id.json) as payer + creator. Refuses mainnet unless
 * --mainnet is passed (DESIGN.md §0: ask before spending real SOL).
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  type FeeMode,
  type Network,
  type PresetId,
  createLaunch,
  explainError,
  getLaunch,
  presets,
  sendSteps,
  sendTx,
} from '@holdfast/sdk'

const { values: args } = parseArgs({
  options: {
    preset: { type: 'string', default: 'fairLaunch' },
    name: { type: 'string' },
    symbol: { type: 'string' },
    uri: { type: 'string' },
    treasury: { type: 'string' },
    'fee-mode': { type: 'string' },
    'first-buy': { type: 'string' },
    mainnet: { type: 'boolean', default: false },
  },
})

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
const network: Network = RPC_URL.includes('mainnet') ? 'mainnet' : RPC_URL.includes('devnet') ? 'devnet' : 'localnet'
const explorer = (kind: 'tx' | 'address', id: string) =>
  network === 'localnet' ? id : `https://explorer.solana.com/${kind}/${id}${network === 'devnet' ? '?cluster=devnet' : ''}`

async function main() {
  if (network === 'mainnet' && !args.mainnet) throw new Error('Refusing to launch on mainnet without --mainnet')
  if (!args.name || !args.symbol || !args.uri) throw new Error('--name, --symbol and --uri are required')
  if (!(args.preset! in presets)) throw new Error(`--preset must be one of ${Object.keys(presets).join(', ')}`)

  const conn = new Connection(RPC_URL, 'confirmed')
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? join(homedir(), '.config/solana/id.json'), 'utf8'))),
  )
  const prepared = await createLaunch(conn, {
    creator: wallet.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.uri,
    preset: args.preset as PresetId,
    network,
    treasury: args.treasury ? new PublicKey(args.treasury) : wallet.publicKey,
    feeMode: args['fee-mode'] as FeeMode | undefined,
    firstBuySol: args['first-buy'] ? Number(args['first-buy']) : undefined,
  })
  const p = prepared.preset
  console.log(`${p.name} on ${network} (${prepared.feeMode} fee mode)`)
  console.log(`  window ${p.rules.windowSecs}s · snipe-lock ${p.rules.snipeLockSecs}s · max wallet ${p.rules.maxWalletBps / 100}% · graduates at ${p.thresholdSol} SOL`)
  console.log(`  fees: ${p.split.holders}% holders / ${p.split.creator}% creator / ${p.split.treasury}% treasury\n`)

  const sigs = await sendSteps(conn, prepared.steps, [wallet])
  prepared.steps.forEach((s, i) => console.log(`✔ ${s.label}: ${explorer('tx', sigs[i])}`))
  if (prepared.buildFirstBuy) console.log(`✔ First buy: ${explorer('tx', await sendTx(conn, await prepared.buildFirstBuy(), [wallet]))}`)

  const launch = (await getLaunch(conn, prepared.mint))!
  console.log(`
mint       ${prepared.mint.toBase58()}
pool       ${prepared.pool.toBase58()}
launch     ${prepared.launch.toBase58()}
fee vault  ${prepared.feeMode === 'dfs' ? prepared.feeVault.toBase58() : '(keeper mode: the wallet claims and deposits)'}
protection ends ${new Date(launch.protectionEndsAt * 1000).toISOString()} — after that the hook cannot reject any transfer
${explorer('address', prepared.mint.toBase58())}`)
}

main().catch((e) => {
  console.error(explainError(e))
  process.exit(1)
})
