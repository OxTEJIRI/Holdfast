import type { Network } from '@holdfast/sdk'

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com'
export const NETWORK: Network = RPC_URL.includes('mainnet') ? 'mainnet' : RPC_URL.includes('devnet') ? 'devnet' : 'localnet'
export const ENABLE_BURNER = process.env.NEXT_PUBLIC_ENABLE_BURNER === '1'
export const GITHUB_URL = 'https://github.com/OxTEJIRI/Holdfast'

export function explorer(kind: 'tx' | 'address', id: string) {
  const cluster = NETWORK === 'mainnet' ? '' : NETWORK === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
  return `https://explorer.solana.com/${kind}/${id}${cluster}`
}
