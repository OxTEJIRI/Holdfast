# Progress

## Phase 0: Environment + verification spike ✅ done

- Toolchain: Rust 1.98 / Solana CLI 4.1.2 (Agave) / Anchor 1.2.0 / Node 22.23 / pnpm 12.10. The Meteora docs MCP is added.
- Workspace scaffold: Anchor workspace (`programs/holdfast`), pnpm workspace, `packages/spike`.
- No-op transfer-hook program with the §5.3 key-seeded extra-account layout.
- `scripts/fetch-fixtures.sh` (mainnet Meteora binaries) and `scripts/local-validator.sh [mainnet|devnet]`.
- `packages/spike`: end-to-end spike script plus a Markdown report generator.
- Every `⚠ VERIFY` resolved on a local validator against both mainnet and devnet program binaries. See `docs/VERIFICATION.md`.
- Spike hook program deployed to devnet: `E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw` (upgrade authority = deployer wallet).
- Devnet spike run: all steps behave as on the local devnet-binaries run. Tx list is in `docs/VERIFICATION.md`.

## Phase 1: Hook + conviction accounting ✅ done

- Program (`programs/holdfast/src`): `Launch` / `Holder` accounts, `init_launch`, `register`, the transfer-hook `execute`, and `finalize` (pulled forward from Phase 2 because §5.6 test 8 needs it). Also `math.rs`, `errors.rs` and `events.rs` (`LaunchCreated`, `HolderRegistered`, `HookEvent`, `LaunchFinalized`).
- `init_launch` checks:
  - param caps;
  - the mint hooks into Holdfast and has no mint authority (fixed supply);
  - the DBC pool/config are the real ones for the mint;
  - the signer is the pool creator;
  - the quote mint matches the config;
  - in DFS mode, `fee_vault` equals the config's fee claimer.

  It also creates the meta list and the rewards PDA's quote-token vault.
- `register` only accepts the owner's Token-2022 ATA (immutable owner, one per wallet). It is closed once the hook is revoked or the launch is finalized.
- Hook: 6,735 CU per transfer (budget 30k). All accounting saturates. The only rejections are `SnipeLocked`, `RecipientNotRegistered` and `MaxWalletExceeded`, and all three are gated on the window and the lock.
- Tests: `pnpm test` (= `scripts/test.sh`) runs the Rust unit tests, builds, starts a fresh validator with the mainnet Meteora binaries, and runs mocha.
  - 12 Rust unit tests. They include §5.6 test 12 (max supply × max duration) and a 256-bit oracle for the forfeit mul-div.
  - 18 integration tests covering §5.6 tests 1–8, plus `init_launch` guards. The fuzz seed can be overridden with `FUZZ_SEED`.
- The pool + `init_launch` + creator ATA + `register` tx is 1,155 of 1,232 bytes. A creator first buy must therefore be a separate tx (§6.1 Tx D), or the creation tx needs an ALT.

## Phase 2: Graduation + rewards ✅ done

- Program: `sync_rewards(index)` (DFS mode: CPIs DFS `claim_fee` signed by the rewards PDA, then distributes), `deposit_rewards(amount)` (keeper mode), `claim()`; Q64.64 accumulator over final points (`math::mul_shr64` with a 256-bit intermediate). Anything that lands in the rewards vault is distributed by the next sync/deposit; before finalize it waits. Payouts round down and are capped at the vault balance, so the vault never overpays.
- Fee mode is enforced on the `launch` account constraint: `sync_rewards` in keeper mode / `deposit_rewards` in DFS mode fail with `WrongFeeMode`.
- §6.1 launch sequence implemented in `tests/helpers.ts` `createLaunch` (Tx A DFS vault → Tx B DBC config with fee claimer = vault → Tx C pool + `init_launch` + creator register). Moves into `@holdfast/sdk` in Phase 3.
- Tests: 15 Rust unit tests; 27 integration tests (adds §5.6 tests 9–11 in DFS mode on mainnet binaries, plus a keeper-mode suite, double-claim, non-owner claim and fee-mode guards). Claims are checked exactly against `floor(final_points × acc / 2^64)` and against cumulative pro rata (never above, short by < 1 lamport per sync round).
- Release profile now `opt-level = "z"`: program 270 KB (was 328 KB), hook 12.6k CU per transfer (budget 30k). Saves ~0.4 SOL of rent per deploy.
- Devnet: program upgraded in place (extended to 269,992 bytes). `scripts/e2e.ts` ran the full story on devnet in keeper mode — protection rules, graduation, migration to a Compounding DAMM v2 pool, two rounds of non-zero holder claims (bonding fees, then post-graduation LP fees). Tx list: `docs/e2e/devnet.md`.

## Phase 3: SDK ✅ done

- `packages/sdk` (`@holdfast/sdk`), per §6:
  - `presets` (Fair Launch / Slow Burn / Arena) with `resolvePreset`, `validateRules` and `validateSplit`;
  - `buildHoldfastConfig` (DBC `buildCurve`, or `buildCurveWithLiquidityWeights` rescaled to the preset threshold for Slow Burn);
  - `createLaunch` (the §6.1 sequence in DFS or keeper mode, plus `buildFirstBuy`);
  - `buy` (quoted slippage, auto-register, ExactOut / PartialFill), `sell`, `transferTokens`, `patchHookAccounts`;
  - `getLaunch`, `getHolder`, `getHolderForOwner`, `getLeaderboard`, `pointsAt`, `projectedShare`, `forfeitPreview`, `claimable`;
  - `finalize`, `crank` (both fee modes, including finalize), `claim` (unwraps to SOL);
  - `explainError` (`"Snipe-locked until 14:32:05"`) and typed PDAs;
  - Node helpers `sendTx` / `sendSteps`.

  The IDL is synced from `target/` by `scripts/sync-idl.sh` (run by `scripts/test.sh`).
- **Deviation:** `createLaunch` returns `steps[].build()` builders instead of prebuilt `txs`. The DBC SDK reads the config account from chain when building the pool tx, so each step must be built after the previous one confirms. The UI flow is unchanged: one signature per step, with progress.
- Slow Burn sets a 10k-token `leftover` (0.001% of supply, withdrawable by the treasury). The DBC liquidity-weights builder needs it as a rounding allowance.
- `scripts/create-launch.ts` uses only the SDK. It refuses mainnet without `--mainnet`.
- Tests (`pnpm test`):
  - 15 Rust unit tests and 13 offline SDK tests. Every preset × network passes the DBC SDK's own `validateConfigParameters` with transfer hook.
  - 39 integration tests. The 27 program tests now run through the SDK. The 12 SDK tests cover every preset launching on the real DBC program within the size limit, plus buy → snipe-lock → leaderboard → crank → claim in both fee modes.
- Launch tx sizes: config 717–1,206 bytes (Slow Burn in DFS mode is the largest); pool + launch 1,111–1,155 bytes. Both are under the 1,232-byte limit.

## Phase 4: Arena simulation ✅ done

- `sim/` (uses only `@holdfast/sdk`): `fund` (27 bots: 3 snipers, a bundler + 5 fresh wallets, a whale, 6 flippers, 10 holders, a closer), `arena` (the §8 timeline; `--speed` scales the timeline **and** the launch's window, lock and fee decay), `report` (copies the run to `docs/arena/<network>/` with a "Who got paid?" README), `sweep` (returns leftover SOL).
- Devnet run (`docs/arena/devnet/`): 90 s window, 300 s lock, 599 s, keeper fee mode.
  - 30 transfers were blocked: 24 `SnipeLocked`, 5 `RecipientNotRegistered` (the bundler), 1 `MaxWalletExceeded` (the whale's in-window grab).
  - Holders earned 35.9 mSOL per SOL invested and the whale 50.3. Snipers and flippers earned 0 (they sold, forfeiting all points). The ≥5× metric is met.
  - Rewards came in two rounds: 0.0250 SOL from bonding fees, then 0.0018 SOL from post-graduation DAMM v2 LP fees.
  - Honest note: snipers and flippers still profited from the price rising. Holdfast removes their fee share, not their trading profit.
- SDK additions: `migrate`, `swapGraduated`, `graduatedPoolAddress`, `hookAccounts`.
  - Hook accounts are now derived locally (no RPC).
  - The launch's pool and the pool config are cached; the quote uses the local clock.
  - `autoRegister: true` means "always prepend"; the default checks first.
  - `patchHookAccounts(tx, mint, source, destination)` no longer takes `conn`.
- **SDK bug fixed:** `holdfastErrorName` mapped *any* program's raw `0x17xx` code to a Holdfast error (DBC's slippage 6002 showed as `MaxWalletExceeded`). It now maps a code only when the failing program is Holdfast.
- **Public devnet RPC:** roughly 100 req/10 s per IP, 40 per method and 40 new connections. Twenty-seven bots exceeded it and opening trades landed after the window closed. The sim now:
  - paces fetches with a token bucket and an in-flight cap;
  - lets at most 2 bot actions build at once, so they finish in scheduled order;
  - shares one blockhash and confirms every pending tx with one batched `getSignatureStatuses` poll;
  - prices trades after the run.

  See `sim/README.md`. A dedicated RPC would allow faster runs; the `/arena` page replays the recorded events at any speed.

## Phase 5: Web app (done locally; Vercel deploy pending the account)

- `apps/web` (Next.js 15, React 19, Tailwind 4, wallet adapter: Phantom, Solflare, Wallet Standard / Backpack). Dark-first, one teal accent; the conviction ring is the signature visual. Pages:
  - `/t/[mint]`: live conviction ring (accrues every second), lock countdown, forfeit preview, leaderboard, rules timeline with countdowns and the honeypot bound, trade panel (switches to DAMM v2 after migration), rewards panel (finalize / route fees / claim / migrate);
  - `/arena`: SSE replay of the recorded devnet run, persona cards, feed, "Who got paid?" chart, final on-chain standings;
  - `/launch`: six-step wizard with a live curve preview; the metadata uri is served statelessly by `/api/metadata/[mint]`;
  - `/` and `/developers`.
- **DoD verified in a real browser on devnet** (`apps/web/e2e/devnet-flow.ts`, headless Chromium + burner wallet). A fresh wallet launched through the wizard, bought (auto-registered), watched points grow (54.9T → 128T), got "Snipe-locked until 10:35:37", then after graduation finalized, routed fees, claimed 0.016579 SOL and migrated. Results and screenshots: `docs/screens/`.
- SDK: `createLaunch` takes an optional `mintKeypair` (the metadata uri contains the mint address).
- The app confirms by polling signature status (the public RPC refuses websockets under load) and polls every 8 s (leaderboard every 30 s).
- Not done: the Vercel deployment needs the user's account (steps in `apps/web/README.md`).

## Decisions / open issues

- **V4:** the DBC SDK can't resolve key-seeded hook accounts (it resolves with default keys). `@holdfast/sdk` `buy`/`sell` patch the hook accounts (`patchHookAccounts`). No on-chain change.
- **V6:** devnet DFS doesn't whitelist DBC `claim_trading_fee2`. Devnet uses the keeper fallback (`deposit_rewards`); mainnet uses DFS. The program supports both modes (`Launch.fee_vault == default` means keeper mode).
- Integration tests (§5.6) use mainnet binaries and must clone the DBC pool-authority PDA (it funds migration rent).
- Devnet wallet: ≈14.3 SOL after the Arena and sweep.
- The web app (Phase 5) should not hit the public devnet RPC hard either: poll moderately and batch account reads.
- DFS `fund_by_claiming_fee` needs a shareholder signer, so in DFS mode the crank is run by the creator or treasury (or the keeper). A Holdfast proxy instruction signed by the rewards PDA would make it fully permissionless; not built (not in spec).
- `packages/spike` targets the Phase 0 program (its standalone `initialize_extra_account_meta_list` no longer exists). It is kept as the Phase 0 record.
- §13 limitations to state in the README: bonding-phase trades must go through `@holdfast/sdk` (V4); only registered ATAs earn points.

## Next

Deploy `apps/web` to Vercel (user's account), then Phase 6 (hardening + README) and Phase 7 (video script, deck, submissions).
