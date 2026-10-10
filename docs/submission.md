# Submission pack

Copy-ready answers for the Colosseum and Superteam forms. Fill the three blanks marked **TODO**.

## Deadlines

| Where | Due |
|---|---|
| Colosseum Crypto World's Fair | **Oct 12, 2026**: confirm the exact hour on colosseum.com/worldsfair |
| Superteam Earn: "Best use of Meteora's DBC" | **Oct 13, 2026, 06:59 UTC** |

## Links

| Field | Value |
|---|---|
| Project name | Holdfast |
| Website | https://hold-fast-mauve.vercel.app |
| GitHub | https://github.com/OxTEJIRI/Holdfast (public) |
| Demo video | **TODO** |
| Deck | **TODO**: the video, or a shared copy of `docs/pitch-deck.md` |
| X (Twitter) | **TODO** |
| Program (devnet) | `E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw` |
| Arena run (proof) | https://hold-fast-mauve.vercel.app/arena · https://github.com/OxTEJIRI/Holdfast/tree/main/docs/arena/devnet |

## One-liner (≤ 100 chars)

Launches that reward the people who stay: conviction-weighted fee sharing for Meteora DBC.

## Short description (≤ 280 chars)

Holdfast is a Token-2022 transfer hook for Meteora DBC launches. It scores holders by how much × how long they hold, locks snipers out of the first minutes, and pays that score as a perpetual share of the launch's fees, from the bonding curve and then DAMM v2.

## Description

On a bonding-curve launch the money goes to the fastest wallets: snipers, bundlers and flippers. The holders who give a token its value earn nothing for staying.

Holdfast is a plug-in conviction layer for Meteora's Dynamic Bonding Curve. A Token-2022 transfer hook scores every holder by how much × how long they hold. Selling part of your bag forfeits the same part of your points, and moving tokens to another wallet forfeits them too.

During a short opening window, only registered wallets can receive tokens, a max-wallet cap applies, and buys are snipe-locked. These rules are hard-capped in the program, so 40 minutes after launch at most, the hook cannot reject any transfer. At graduation DBC revokes the hook entirely.

At graduation conviction freezes and becomes a perpetual claim on the launch's fees. Fees come from the bonding curve, then from a Compounding DAMM v2 pool whose partner LP is locked forever. On mainnet they are routed through Meteora's Dynamic Fee Sharing; on devnet, whose DFS build lacks a whitelist entry hook pools need, a keeper does the split. Either way they are paid to holders pro rata in SOL.

We proved it with an Arena: 27 bots on one real devnet launch. Holders earned 35.9 mSOL of rewards per SOL invested, while snipers and flippers earned zero. Holdfast blocked 30 snipe-and-dump attempts. The whale earned the most per SOL because, once blocked in the window, it bought after it and held; selling would have zeroed it.

## Meteora integration (for "Best use of DBC")

- **DBC:**
  - transfer-hook pools on Token-2022 (`createConfigWithTransferHook`, `createPoolWithTransferHook`, `swap2WithTransferHook`);
  - the exponential anti-sniper fee scheduler and dynamic fees;
  - `claimPartnerTradingFee2`;
  - hook revocation at curve completion, which bounds the hook's power.
- **DAMM v2:** `migrateToDammV2` into a **Compounding** pool. The partner LP is permanently locked and owned by the fee claimer, so LP fees keep flowing to holders after graduation. The creator's LP vests (7-day cliff, 90 days).
- **Dynamic Fee Sharing:** a PDA fee vault as the DBC fee claimer, funded by `fund_by_claiming_fee` from DBC and from DAMM v2 `claim_position_fee`. Holdfast's `sync_rewards` CPIs `claim_fee`, signed by our rewards PDA.
- **What we found doing it (documented in `docs/VERIFICATION.md`):**
  - The stock DBC SDK resolves hook accounts with placeholder keys, so our SDK patches them.
  - Devnet's DFS build doesn't whitelist `claim_trading_fee2`, so devnet runs in keeper mode while the DFS path is proven against mainnet binaries.

## What's built

- An Anchor program (transfer hook, conviction accounting, a Q64.64 reward accumulator) with 15 Rust unit tests.
- `@holdfast/sdk`: three-call integration, presets, live conviction views and readable errors.
- 48 integration tests on a local validator running the real Meteora programs, including security regressions, plus a browser end-to-end run on devnet.
- A Next.js app: launch wizard, token page with a live conviction ring, the Arena replay, and a developers page.

## Colosseum

- Submitting to Colosseum: **yes**. Paste the Colosseum project link here once created: **TODO**.

## Final checks before submitting

- [ ] The video is uploaded, and its link is in the README (send it to Claude).
- [ ] The website loads on a phone and on desktop.
- [ ] The README's top links work.
- [ ] Both forms submitted; keep the confirmation emails.
