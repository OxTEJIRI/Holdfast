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

## Decisions / open issues

- **V4:** the DBC SDK can't resolve key-seeded hook accounts (it resolves with default keys). `@holdfast/sdk` `buy`/`sell` patch the hook accounts (`tests/helpers.ts` `patchHookAccounts` → move into the SDK in Phase 3). No on-chain change.
- **V6:** devnet DFS doesn't whitelist DBC `claim_trading_fee2`. Devnet uses the keeper fallback (`deposit_rewards`); mainnet uses DFS. The program supports both modes (`Launch.fee_vault == default` means keeper mode).
- Integration tests (§5.6) use mainnet binaries and must clone the DBC pool-authority PDA (it funds migration rent).
- **Devnet SOL is nearly gone (≈0.19 SOL left).** The Arena (Phase 4) needs ~10–12 devnet SOL.
- DFS `fund_by_claiming_fee` needs a shareholder signer, so in DFS mode the crank is run by the creator or treasury (or the keeper). A Holdfast proxy instruction signed by the rewards PDA would make it fully permissionless; not built (not in spec).
- `packages/spike` targets the Phase 0 program (its standalone `initialize_extra_account_meta_list` no longer exists). It is kept as the Phase 0 record.
- §13 limitations to state in the README: bonding-phase trades must go through `@holdfast/sdk` (V4); only registered ATAs earn points.

## Next: Phase 3 (SDK)

`@holdfast/sdk` per §6: presets, `buildHoldfastConfig`, `createLaunch`, `buy`/`sell` (with the V4 hook-account patch), getters, `projectedShare`, `finalize`/`crank`/`claim`, `explainError`, typed PDAs. Move the harness logic in `tests/helpers.ts` into it.
