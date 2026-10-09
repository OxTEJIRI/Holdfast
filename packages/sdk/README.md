# @holdfast/sdk

Add conviction-weighted holder rewards to any Meteora DBC launchpad. Holders earn a perpetual share of the launch's fees in proportion to *how much × how long* they hold; snipers are locked out of the first minutes.

## Three calls

```ts
import { createLaunch, buy, claim, crank } from '@holdfast/sdk'

// 1. Launch: DFS fee vault → DBC hook config → pool + Holdfast launch (send each step in order)
const launch = await createLaunch(conn, {
  creator, treasury, name: 'My Token', symbol: 'MYT', uri,
  preset: 'fairLaunch', network: 'devnet',
})
for (const step of launch.steps) await signAndSend(await step.build(), step.signers)

// 2. Trade: buy registers the buyer on first use and fixes the transfer-hook accounts
await signAndSend(await buy(conn, { owner, mint: launch.mint, solIn: 0.1 }))

// 3. Get paid: after graduation, crank routes fees to holders; holders claim in SOL
for (const tx of await crank(conn, { mint, signer: creator })) await signAndSend(tx)
await signAndSend(await claim(conn, { owner, mint }))
```

Node scripts can use `sendSteps(conn, launch.steps, [keypair])` and `sendTx(conn, tx, [keypair])`.

## What's in the box

| | |
|---|---|
| `presets`, `buildHoldfastConfig` | Fair Launch / Slow Burn / Arena (DESIGN.md §4.2) → DBC `ConfigParameters` |
| `createLaunch` | the §6.1 transaction sequence (DFS or keeper fee mode) |
| `buy`, `sell`, `transferTokens`, `patchHookAccounts` | bonding-phase trading (see "Why patch?") |
| `getLaunch`, `getHolder(ForOwner)`, `getLeaderboard` | accounts + live conviction |
| `pointsAt`, `projectedShare`, `forfeitPreview`, `claimable` | the numbers the UI shows |
| `finalize`, `crank`, `claim` | graduation and rewards |
| `explainError` | program errors → sentences (`"Snipe-locked until 14:32:05"`) |
| `launchPda`, `holderPda`, … | typed PDAs |

## Why patch the hook accounts?

The DBC SDK resolves transfer-hook accounts with source = destination = `PublicKey.default`. Holdfast's holder records are PDAs of the real token accounts, so swaps built by the plain DBC SDK fail. `buy`/`sell` re-resolve the accounts for the real source and destination (`docs/VERIFICATION.md`, V4). During the bonding phase, integrators must trade through this SDK (or apply `patchHookAccounts`). After graduation the hook is revoked and the token trades anywhere.

## Fee modes

- `dfs` (mainnet default): the DBC fee claimer is a Meteora Dynamic Fee Sharing vault. `crank` must be signed by a DFS shareholder (creator or treasury); `sync_rewards` itself is permissionless.
- `keeper` (devnet default): devnet's DFS build can't claim DBC fees from hook pools, so a keeper wallet is the fee claimer and deposits the holders' share.

## Limits

- The launch transaction (pool + `init_launch` + creator register) is about 1,116–1,155 of 1,232 bytes. A creator first buy is a separate transaction (`buildFirstBuy`).
- The Slow Burn config transaction in DFS mode is 1,206 bytes, so there is no room to add priority-fee instructions to it.
