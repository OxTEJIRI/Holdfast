import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // the SDK ships TypeScript source from the workspace
  transpilePackages: ['@holdfast/sdk'],
  // the recorded Arena run, read by the SSE route at runtime
  outputFileTracingIncludes: { '/api/arena/stream': ['./data/arena/**'] },
  webpack: (config) => {
    // Solana / Anchor libraries reference Node built-ins they don't use in the browser
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false, crypto: false }
    return config
  },
}

export default nextConfig
