# Holdfast web app

Next.js 15 (App Router), React 19, Tailwind 4, Solana wallet adapter, `@holdfast/sdk`.

Live (devnet): https://hold-fast-mauve.vercel.app

| Route | What |
|---|---|
| `/` | pitch, how it works, the provable-safety timeline, Arena results |
| `/t/[mint]` | curve progress, buy/sell, your conviction ring, leaderboard, rules timeline, rewards (finalize / route fees / claim / migrate) |
| `/arena` | replay of the recorded devnet Arena run (`data/arena`, copied from `docs/arena/devnet`) over SSE; `?live=1` on the stream tails a local `sim/out/events.jsonl` |
| `/launch` | six-step launch wizard with a live curve preview |
| `/developers` | the three SDK calls, accounts, safety caps |
| `/api/metadata/[mint]` | stateless token metadata JSON (from the uri query string) |

```bash
pnpm -C apps/web dev            # http://localhost:3000, devnet by default
NEXT_PUBLIC_RPC_URL=…           # optional: a dedicated RPC (recommended; the public one rate-limits)
```

## Browser end-to-end test (devnet)

Proves the Phase 5 DoD in a real browser: a fresh wallet launches, buys (auto-registers), watches conviction grow, hits a snipe-lock, and claims after graduation. Screenshots and results go to `docs/screens/`.

```bash
NEXT_PUBLIC_ENABLE_BURNER=1 pnpm -C apps/web build && PORT=3100 pnpm -C apps/web start
pnpm -C apps/web e2e        # needs Playwright's Chromium: npx playwright@1.56.1 install chromium
```

`NEXT_PUBLIC_ENABLE_BURNER=1` adds an in-browser burner wallet. Use it only for tests, never in production.

## Deploying to Vercel

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `apps/web`. Leave "Include files outside the root directory" on: the build copies `docs/arena/devnet`.
3. Framework preset: Next.js. The install command defaults to pnpm from the repo root.
4. Environment variables:
   - `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses the repo's pinned pnpm 12;
   - `NEXT_PUBLIC_RPC_URL` (optional) for a devnet RPC URL.
