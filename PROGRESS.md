# Progress

## Phase 0: Environment + verification spike ✅ done

Done:
- Toolchain: Rust 1.98 / Solana CLI 4.1.2 (Agave) / Anchor 1.2.0 / Node 22.23 / pnpm 12.10. The Meteora docs MCP is added.
- Workspace scaffold: Anchor workspace (`programs/holdfast`), pnpm workspace, `packages/spike`.
- No-op transfer-hook program with the §5.3 key-seeded extra-account layout.
- `scripts/fetch-fixtures.sh` (mainnet Meteora binaries) and `scripts/local-validator.sh [mainnet|devnet]`.
- `packages/spike`: end-to-end spike script plus a Markdown report generator.
- Every `⚠ VERIFY` resolved on a local validator against both mainnet and devnet program binaries. See `docs/VERIFICATION.md`.
- Spike hook program deployed to devnet: `E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw` (upgrade authority = deployer wallet).
- Devnet spike run: all steps behave as on the local devnet-binaries run. Tx list is in `docs/VERIFICATION.md`.

## Decisions / open issues
- **V4:** the DBC SDK can't resolve key-seeded hook accounts (it resolves with default keys). `@holdfast/sdk` `buy`/`sell` patch the hook accounts. No on-chain change.
- **V6:** devnet DFS doesn't whitelist DBC `claim_trading_fee2`. Devnet uses the keeper fallback (`deposit_rewards`); mainnet uses DFS. The program supports both modes.
- Integration tests (§5.6) use mainnet binaries and must clone the DBC pool-authority PDA (it funds migration rent).

## Next: Phase 1 (hook + conviction accounting)
