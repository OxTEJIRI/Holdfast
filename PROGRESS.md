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

## Decisions / open issues

- **V4:** the DBC SDK can't resolve key-seeded hook accounts (it resolves with default keys). `@holdfast/sdk` `buy`/`sell` patch the hook accounts (`tests/helpers.ts` `patchHookAccounts` → move into the SDK in Phase 3). No on-chain change.
- **V6:** devnet DFS doesn't whitelist DBC `claim_trading_fee2`. Devnet uses the keeper fallback (`deposit_rewards`); mainnet uses DFS. The program supports both modes (`Launch.fee_vault == default` means keeper mode).
- Integration tests (§5.6) use mainnet binaries and must clone the DBC pool-authority PDA (it funds migration rent).
- The devnet deployment is still the Phase 0 no-op hook (134 KB). The current program is 271 KB, so the devnet upgrade needs `solana program extend` (~1 SOL extra rent). Do this in Phase 2 before the devnet end-to-end run.
- `packages/spike` targets the Phase 0 program (its standalone `initialize_extra_account_meta_list` no longer exists). It is kept as the Phase 0 record.
- §13 limitations to state in the README: bonding-phase trades must go through `@holdfast/sdk` (V4); only registered ATAs earn points.

## Next: Phase 2 (graduation + rewards)

`sync_rewards` (DFS CPI), `claim`, `deposit_rewards` (keeper mode), the §6.1 launch tx sequence, and §5.6 tests 9–11.
