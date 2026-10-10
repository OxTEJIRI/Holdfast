'use client'
import { Buffer } from 'buffer'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-unsafe-burner'
import { type ReactNode, useMemo } from 'react'
import { ENABLE_BURNER, RPC_URL } from '@/lib/config'
import { ToastProvider } from './Toast'
import '@solana/wallet-adapter-react-ui/styles.css'

// Solana / Anchor libraries expect Node's Buffer in the browser
if (typeof window !== 'undefined') (globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer

export function Providers({ children }: { children: ReactNode }) {
  // Backpack and other Wallet Standard wallets are detected automatically
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), ...(ENABLE_BURNER ? [new UnsafeBurnerWalletAdapter()] : [])],
    [],
  )
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
