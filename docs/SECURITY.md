# Security review (Phase 6, self-review)

This is the builders' own review, not an audit. Each item names the test that pins it.

## Fixed

### Hidden-bag forfeiture bypass (fixed, deployed to devnet)

**Finding.** The original rule (design spec §3.3) skipped forfeiture for transfers between two accounts with the same owner. But `register` only accepts the owner's associated token account, so a same-owner destination is always an *untracked* account. A holder could:
1. move the whole bag into a second, plain token account they own (no forfeit);
2. sell it from there (no record involved);
3. keep every point and still collect rewards.

**Reproduced** on a local validator: after the move, `tracked_balance = 0` while `points = 25,046,445,302,486`.

**Fix.** Every move out of a tracked record forfeits points pro rata, regardless of the destination (`hook.rs` `on_outgoing`). No legitimate flow loses anything: a wallet has exactly one tracked account.

**Tests.**
- `tests/security.test.ts`: "a second account of your own is not a hiding place".
- Rust unit test `every_move_out_forfeits_points_with_the_tokens`.

## Checked and holding

| Concern | Why it holds | Test |
|---|---|---|
| Forged hook accounts (an empty or foreign holder record, a fake launch or meta list) used to skip the snipe-lock or forfeiture | Token-2022 re-resolves the ExtraAccountMetaList against the real source and destination, and rejects any mismatch (`IncorrectAccount`, `0xa261c2c0`) before the hook runs. The hook also checks that a loaded record's `launch` and `token_account` match. | `tests/security.test.ts`: forged sender record (empty and another holder's), forged receiver, forged meta list, empty launch, another launch's account |
| Calling `execute` directly, outside a transfer | The source must be a Token-2022 account whose `transferring` flag is set, which is only true inside a real transfer. | `NotTransferring` guard in `hook.rs` |
| Hijacking someone's launch | `init_launch` must be signed by the DBC pool's creator and must run alongside pool creation. It checks the pool, config, quote mint, the mint's hook program and a fixed supply. | "rejects an init_launch signed by someone other than the pool creator", "rejects params above the hard caps" |
| The 40-minute bound | The only rejections are `RecipientNotRegistered`/`MaxWalletExceeded` (window only) and `SnipeLocked`, whose `unlock_ts` is only ever set inside the window to `now + lock`. Accounting saturates (forfeit ≤ points and moved ≤ balance by construction), so no arithmetic can fail a transfer. | fuzz: 60 random buys, sells and transfers after window + lock all succeed; Rust `nothing_rejects_after_window_plus_lock` |
| Overflow | Points are u128 (`u64::MAX × i64::MAX` fits); forfeit uses an exact overflow-free mul-div; payouts use a 256-bit intermediate (`mul_shr64`). | Rust `overflow_at_max_supply_and_duration`, `forfeit_matches_256_bit_oracle`, `mul_shr64_matches_oracle` |
| Rounding direction | The reward-per-point increment and each payout round down; the vault keeps the dust. Each claim is also capped at the vault balance. | "claims never exceed what was added"; within 1 lamport per round of pro rata |
| Claiming twice, or someone else's rewards | `reward_debt` grows by each payout; the holder record is `has_one = owner`, `has_one = launch`, and seed-checked. | "can't claim twice", "rejects claiming someone else's record" |
| Global vs per-holder totals drifting (which would let early claimers overdraw) | Every change updates the record and the launch totals at the same timestamp with the same amounts. | `assertTotalsConsistent` after every scenario, including the fuzz; Rust `global_total_equals_sum_of_holders` |
| Wrong fee mode | `sync_rewards` requires a DFS vault and `deposit_rewards` requires keeper mode (constraint on `launch`). | "deposit_rewards is rejected in DFS mode", "sync_rewards is rejected in keeper mode" |

## Residual risks

- **Upgrade authority.** The devnet program is upgradeable by the deployer. Make it immutable before mainnet use (design spec §3.2).
- **Keeper mode trust.** In keeper mode the keeper decides how much of the fees to deposit for holders. DFS mode removes this.
- **Zero final points.** If nobody holds a tracked balance at graduation, deposited rewards stay in the vault.
- **Not audited.** This is a devnet demonstration.
