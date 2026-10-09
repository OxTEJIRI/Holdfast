# Phase 0: Verification spike

This file resolves every `⚠ VERIFY` in DESIGN.md and records which fallback each one needs.

**How it was verified.** I deployed a no-op transfer-hook program (`programs/holdfast`, Phase 0 version).
Its `ExtraAccountMetaList` uses the same key-seeded layout as DESIGN.md §5.3 (`launch`, `src_holder`,
`dst_holder`), and `execute` only logs. The script `packages/spike/src/spike.ts` then drives the whole
Meteora flow and writes every tx and finding to `packages/spike/out/<run>.json`.

| Run | Programs | Result file |
|---|---|---|
| localnet, mainnet binaries | DBC / DFS / DAMM v2 dumped from mainnet (`scripts/fetch-fixtures.sh`) | `out/localnet-mainnet-bins.json` (all 20 steps pass) |
| localnet, devnet binaries | DBC / DFS / DAMM v2 cloned from devnet (`scripts/local-validator.sh devnet`) | `out/localnet-devnet-bins.json` (all pass except step H, see V6) |
| **devnet** | live devnet | `out/devnet.json` (see [Devnet tx list](#devnet-tx-list)): same as the devnet-binaries run |

To reproduce: `scripts/local-validator.sh [mainnet|devnet] --reset`, then
`cd packages/spike && LABEL=… pnpm spike`. For devnet: `anchor deploy --provider.cluster devnet`, then
`RPC_URL=https://api.devnet.solana.com pnpm spike`.

---

## Checklist (DESIGN.md §10, Phase 0, item 4)

| # | Item | Result | Fallback / action |
|---|---|---|---|
| V1 | Transfer-hook pools work on devnet (same DBC program ID) | ✅ The DBC program `dbcij3…` on devnet takes hook configs, hook pools, `swap2WithTransferHook`, completion and DAMM v2 migration. Devnet run: see the [tx list](#devnet-tx-list). | — |
| V2 | `tokenAuthorityOption = Immutable` accepted for hook configs | ✅ Accepted. The resulting mint has `mintAuthority = null` and `freezeAuthority = null`, supply is fixed at 1e9 × 10⁶, and the hook authority is the DBC pool authority. | — |
| V3 | Meta list can be created after pool init in the same tx | ✅ `createPoolWithTransferHook` followed by Holdfast `initialize_extra_account_meta_list` in one tx works. DBC does not touch the meta list at pool creation. | — |
| V4 | SDK auto-resolves our extra accounts for a first-time buyer | ❌ **No.** See V4 below. | Holdfast SDK resolves the hook accounts itself (no on-chain change) |
| V5 | `finishCurveTimestamp` location in the DBC pool account | ✅ `u64` LE at **byte offset 344** of the pool account (discriminator included). Same layout for `VirtualPool` and `TransferHookPool`. It reads 0 before completion and equals the SDK-decoded value after. | — |
| V6 | DFS on devnet; DFS vault PDA as DBC `feeClaimer` via `fund_by_claiming_fee` + `ClaimTradingFee2` | ⚠️ **Mainnet: yes. Devnet: no.** DFS is deployed on devnet, but the devnet build does not whitelist DBC `claim_trading_fee2`. See V6 below. | **Devnet: listed keeper fallback (§4.3). Mainnet: DFS path.** |
| V7 | Partner's migrated DAMM v2 position owned by `feeClaimer` and claimable via DFS `ClaimPositionFee` | ✅ The position NFT is set to `config.fee_claimer` (`migrate_damm_v2_initialize_pool.rs`) and is permanently locked. DFS `fund_by_claiming_fee` → DAMM v2 `claim_position_fee` funded the vault (1,011,902 lamports in the spike) on **both** binary sets. | — |
| V8 | Which `dammConfig` to pass to `migrateToDammV2` for Customizable fees | ✅ `A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck` (`DAMM_V2_MIGRATION_FEE_ADDRESS[6]`), owned by DAMM v2 on devnet and mainnet. The migrated pool reports `collectFeeMode = 2` (Compounding). | — |
| V9 | Pool-authority PDA address | ✅ `FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM` = PDA(`["pool_authority"]`, DBC). Matches the SDK's `deriveDbcPoolAuthority()`. | — |

Also confirmed, from the spike and the DBC source:

- **The hook is revoked in the swap that completes the curve.** After completion the mint's TransferHook
  `program_id` and `authority` are both `None`, and a plain `transferChecked` with no hook accounts
  succeeds. `finalize()` can use either signal.
- **The hook program must be deployed before the config is created.** `create_config_with_transfer_hook`
  requires `transfer_hook_program` to be `executable`. DBC also refuses DBC, SPL Token and Token-2022 as
  hook programs.
- **Wallet-to-wallet transfers with the hook active work** through `@solana/spl-token`'s
  `createTransferCheckedWithTransferHookInstruction`. That helper resolves key-seeded extras correctly,
  because it is given the real source and destination.
- **The DFS shareholder claim works.** `claim_fee` by a shareholder (the creator) succeeds.
- **The keeper fallback works.** On a hook pool with `feeClaimer` = keypair,
  `client.partner.claimPartnerTradingFee2` claims the partner quote fee (2,691,144 lamports in the spike).
- **Liquidity split.** Partner 50% permanently locked plus creator 50% vesting (7-day cliff, 90 periods)
  validates and migrates. The partner position is permanently locked; the creator position is vested.

---

## V4: SDK hook-account resolution (deviation, no fallback listed)

`swap2WithTransferHook`, and every other DBC SDK hook path, builds the hook accounts by calling
`createTransferCheckedWithTransferHookInstruction` with **source = destination = authority =
`PublicKey.default`** (`getRemainingAccountsForTransferHook` in `services/program.ts`). Our seeds
`["holder", source]` and `["holder", destination]` therefore resolve to PDA(`["holder", 1111…]`) for every
swap. Token-2022 re-resolves the PDAs on-chain with the real accounts, finds that they don't match, and
the swap fails with `0xa261c2c0` (spl-tlv-account-resolution `IncorrectAccount`). This is step D1 in
every run.

`Swap2Params` has no override, so the SDK cannot be told the right accounts. (The first-buy and
config-and-pool helpers do accept `transferHookAccountsInfo` / `transferHookAccounts`.)

**Resolution:** keep the on-chain design (key-seeded holder PDAs). The Holdfast SDK's `buy`/`sell` build
the DBC swap with the Meteora SDK, then splice in hook accounts resolved for the real
`(source, destination, authority)`:

- buy: (pool base vault, buyer ATA, pool authority)
- sell: (seller ATA, pool base vault, seller)

The slice length is unchanged, so `TransferHookAccountsInfo` stays valid. This is `patchHookAccounts()`
in `spike.ts`, and it works for first-time buyers whose ATA doesn't exist yet (step D2). No account-data
seeds are involved.

**Consequence.** During the bonding phase, a client that uses the raw DBC SDK `swap2WithTransferHook`
cannot trade Holdfast tokens; it has to use `@holdfast/sdk` (or the same 10-line patch). This tightens the
"bonding-phase trading routes only through our UI/SDK" limitation in DESIGN.md §13, and should be stated
there and on `/developers`. Seeds that resolve with default keys can't identify a holder, so making the
SDK path work would mean giving up per-holder accounting. No on-chain design change.

## V6: DFS + DBC `claim_trading_fee2` on devnet

The DFS `fund_by_claiming_fee` whitelist is compiled into the binary as a table of
`(program, discriminator, token_vault_index)` entries. Scanning the deployed bytes for each whitelisted
discriminator:

| Discriminator | devnet DFS (`dfsdo2…`, 762,000 B) | mainnet DFS (724,704 B) |
|---|---|---|
| DBC `claim_trading_fee` | ✓ | ✓ |
| DBC `claim_trading_fee2` (hook pools) | **✗** | ✓ |
| DBC `claim_creator_trading_fee2` | **✗** | ✓ |
| DBC `partner/creator_withdraw_surplus`, `withdraw_migration_fee` | ✓ | ✓ |
| DAMM v2 `claim_position_fee`, `claim_reward` | ✓ | ✓ |

The DBC v1 `claim_trading_fee` rejects transfer-hook pools (`PoolTypeMismatch`). So on devnet the partner's
**bonding-curve** fees on a hook pool cannot be routed through DFS. Behaviour matches the scan: step H
fails on devnet binaries with DFS `InvalidAction (6009)` and succeeds on mainnet binaries (14,430,339 +
104,403,515 lamports funded).

**Decision (per DESIGN.md §4.3 fallback):**

- **Devnet** (demo, Arena, web app): `feeClaimer` = keeper keypair. The keeper calls
  `claimPartnerTradingFee2` (proven in step H2) and then Holdfast `deposit_rewards` with the holders'
  share. After migration the partner's DAMM v2 position is owned by the same keeper, which claims LP
  fees via DAMM v2 `claim_position_fee` and deposits the same way. `Launch.fee_vault = Pubkey::default()`.
- **Mainnet**: the DFS path as designed. `feeClaimer` = DFS vault PDA, and `sync_rewards` CPIs DFS. It is
  proven end-to-end on mainnet binaries (steps A–L), including DAMM v2 LP fees after migration.
- The program supports both modes (§5.2 already has `deposit_rewards`). Integration tests run on mainnet
  binaries (§5.6), so the DFS path stays covered.

## Environment notes (for Phase 1 tests)

- **Program binaries differ between devnet and mainnet** for all three Meteora programs.
  `scripts/fetch-fixtures.sh` dumps the mainnet ones into `fixtures/` (gitignored), and
  `scripts/local-validator.sh` loads them.
- **The deployed DBC funds DAMM v2 migration rent from the DBC pool-authority PDA's own lamports**: about
  69 SOL on mainnet and 99 SOL on devnet. (The GitHub source uses a `flash_rent` from `payer` instead.)
  The local validator must clone `FhVo3mqL…` or migration fails with "insufficient lamports 0".
  `scripts/local-validator.sh` does this.
- Anchor 1.2 has no `#[interface]` attribute. The hook uses
  `#[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]` (spl-discriminator 0.5).
- The DFS SDK's `fundByClaimDbcPartnerTradingFee2` encodes `TransferHookAccountsInfo { slices: [] }`. That
  is valid because `collectFeeMode = QuoteToken` means no base-token (hooked) transfer happens in the claim.

---

## Devnet tx list

Hook program deployed to devnet: `E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw` (SBPF v3, 134,544 bytes),
deploy tx [5EaQBocq…Cabsgix](https://explorer.solana.com/tx/5EaQBocqvhfkmb1LxCpaadSVKU69UQ8NQSsaEpd1u9Fo43XNpxxNt9hb5sZpb966itNgTQ7XsHoEKNyaCDabsgix?cluster=devnet).

The devnet run matches the local devnet-binaries run step for step:

- **Row 6 (D1)** is a simulation that is *expected* to fail. The SDK auto-resolved hook accounts are
  rejected with `0xa261c2c0` (`IncorrectAccount`); see V4. Row 7 is the same buy with Holdfast-resolved
  accounts, and it succeeds.
- **Row 10 (H)** fails in simulation (no tx sent) with DFS `InvalidAction (6009)` at
  `ix_fund_by_claiming_fee.rs:46`: devnet DFS doesn't whitelist `claim_trading_fee2` (V6). Rows 11–14
  prove the keeper fallback on devnet (1,876,920 lamports claimed by the keeper).
- Row 15 completes the curve. `finishCurveTimestamp` at offset 344 = `1791560021` (matches the SDK), and
  the mint's TransferHook program and authority are both `None` afterwards.
- Row 17 migrates into DAMM v2 pool `HSnGSwMn…` with `collectFeeMode = 2` (Compounding). The partner
  position `DHqNLSYo…` is owned by the DFS vault PDA `9nbNjvGy…` and permanently locked; row 20 claims its
  LP fee through DFS (1,011,902 lamports).
- Wallet SOL spent by the run: 1.08 SOL (mostly the curve buys).

Run: `devnet` at 2026-10-09T15:33:02.067Z

| # | Step | Result | Tx |
|---|---|---|---|
| 1 | fund AvL2Qv… 1 SOL | ok | [2AGm3obt…MKL2pY](https://explorer.solana.com/tx/2AGm3obtYyN6jQVp9LeYCECuQakEhzyL1eE6fjSqYhoSCZtfmdero54fDKfP179EHZLsSU82BALJZ7AjzdMKL2pY?cluster=devnet) |
| 2 | fund Cp1tuD… 0.02 SOL | ok | [7u5Be5yZ…1fcB18](https://explorer.solana.com/tx/7u5Be5yZDjT4ekdvEuVdarTFMCfWRruFNEmrmVNSUKLbzYteYitQ6dMDW5CpdbJYWQHLj3FYoMK826eZt1fcB18?cluster=devnet) |
| 3 | A. DFS initialize_fee_vault_pda (base = DBC config keypair) | ok | [5U3EnDre…CbuVeH](https://explorer.solana.com/tx/5U3EnDre8N2aRmHbMVYM8HgCEuC7nZrdZGYbShT6NNh9zTaiu4S3AfL4k7s5h3fudvtEpYexaz4EKZCu9wCbuVeH?cluster=devnet) |
| 4 | B. DBC createConfigWithTransferHook (tokenAuthorityOption = Immutable, feeClaimer = DFS vault PDA) | ok | [35jqoWwF…5QEcNa](https://explorer.solana.com/tx/35jqoWwFokbcozW9QJY77Cy7WsUEjDHzBLWnwNmFzHLDgtXNvMbcEntHRrrKFgoGTCTNrrbpNtj7XBibor5QEcNa?cluster=devnet) |
| 5 | C. DBC createPoolWithTransferHook + Holdfast initialize_extra_account_meta_list (same tx) | ok | [5X4Lnb8o…eAgF7k](https://explorer.solana.com/tx/5X4Lnb8oj94iyfR5xMgS5twGsRNFhMt7M9HePmvoFFtoeg9n1st9ALy4oNj2s5w8Hpo9XQw1DaMkGEwzsteAgF7k?cluster=devnet) |
| 6 | D1. buy with SDK auto-resolved hook accounts (first-time buyer) — expected to FAIL | ok | — |
| 7 | D2. buy via swap2WithTransferHook with Holdfast-resolved hook accounts (first-time buyer) | ok | [4HYkYUfE…S2YvEW](https://explorer.solana.com/tx/4HYkYUfEqCPY8CV7SteTYL8zBXWjWXWraQ1VCC4BdurPTT1JjFA1V97ojR5AcgqFkX9oX3NS4UdBRg27whS2YvEW?cluster=devnet) |
| 8 | E. sell 25% via swap2WithTransferHook (resolved hook accounts) | ok | [4zSu9AV6…4fEHYv](https://explorer.solana.com/tx/4zSu9AV6YXvMeauLb4gaESDXBmJjn8NDUoayXe3RCPiedV9dAsqmYKZ9p9msvZchhMAXBR9BE9VzykCnNc4fEHYv?cluster=devnet) |
| 9 | F. wallet→wallet transferChecked with hook (spl-token resolver) | ok | [MAFQdLVA…dxW2gG](https://explorer.solana.com/tx/MAFQdLVAhipPumPuqUfT8mUDsuGo8k1nVJJm4wvHA3VQcN7upmHWJeUNqAwKivmHhSLDiXr9LoZUiLx9fdxW2gG?cluster=devnet) |
| 10 | H. DFS fund_by_claiming_fee → DBC claim_trading_fee2 (fee vault PDA signs as feeClaimer) | **failed**: Simulation failed.  | — |
| 11 | H2a. keeper fallback: createConfigWithTransferHook (feeClaimer = keeper wallet) | ok | [5L2rmEze…owDSqX](https://explorer.solana.com/tx/5L2rmEzefK6XUuXGnZthhYhms565W8q24tWBG7tKd3xDJhXXABiToJVztK3Lx3vdgZXCTiuxStDnA3DEu3owDSqX?cluster=devnet) |
| 12 | H2b. keeper fallback: pool + meta list | ok | [oBcPpWX9…vu3FNa](https://explorer.solana.com/tx/oBcPpWX9oUQMc2iRK33WPyXJjrYKHGFtn5L8JrG5PGE7s8prkdDiUS4KAUGQk3kFHnjR56fvmNes3urN9vu3FNa?cluster=devnet) |
| 13 | H2c. keeper fallback: buy | ok | [2A4kcERe…VNBsnn](https://explorer.solana.com/tx/2A4kcERek92ECEQkbA7PwsaS7KKVfW4ZxaizmQKm88D2qX8HNnFTMFcPZURgYv3DeETe9bcx8fpk1XN3oJVNBsnn?cluster=devnet) |
| 14 | H2d. keeper fallback: claimPartnerTradingFee2 by keeper keypair | ok | [4mAEVZ1a…dxp4X3](https://explorer.solana.com/tx/4mAEVZ1afeS3V3rnbSpoXPJXWphA7ncAxqgXEY5uatW2seeyuShuXKKYDXF6jcx3MRyEvLGigVnnoHFtAHdxp4X3?cluster=devnet) |
| 15 | I. buy that completes the curve (PartialFill) | ok | [3beXQV6U…axQqs8](https://explorer.solana.com/tx/3beXQV6UcufoujXrVmWDJKcKAmFbqPQctG57JB5rL31CzDD9LC3phpUETcGQN9nobo1grhteuXyEuTRHiQaxQqs8?cluster=devnet) |
| 16 | I2. plain transferChecked after completion (no hook accounts) | ok | [4j7uzvPL…HvGNnw](https://explorer.solana.com/tx/4j7uzvPLND4LiXB1TnZwPdFBJ4cU8MJud6F5A4yxwYHpMXGATdstJ25b87qiP2gNX55trdeS63HVg6LVhqHvGNnw?cluster=devnet) |
| 17 | J. migrateToDammV2 (dammConfig = Customizable) | ok | [2GMp1M48…ywzi34](https://explorer.solana.com/tx/2GMp1M48hxEre1KSDCNpVuvCXZhBVwrHFqax4gixdZ37AHo7YfzftV6vmG4G3z8J8DSDGqdbPUazZidWDFywzi34?cluster=devnet) |
| 18 | K1. DAMM v2 swap SOL→base (generate LP fees) | ok | [4ttfPZJn…PyQHF8](https://explorer.solana.com/tx/4ttfPZJnEQSY3n2PMzKZGxq1gBMBkm55ASUa5h5nyc62Lr9mH1spBLyadSvw7gP1BKSGeCdb2JpRDu58HCPyQHF8?cluster=devnet) |
| 19 | K2. DAMM v2 swap base→SOL (generate LP fees) | ok | [3r58hQMG…vd2rEd](https://explorer.solana.com/tx/3r58hQMGYbB6pm59tvueKGaJd671rRxAY4T9jGWssjxgGBy464hfLkryvtkUEsd5Pjrc98PN8Dvdgskse9vd2rEd?cluster=devnet) |
| 20 | K3. DFS fund_by_claiming_fee → DAMM v2 claim_position_fee (partner LP owned by fee vault PDA) | ok | [4XdEKuk3…axfVxd](https://explorer.solana.com/tx/4XdEKuk3ehhF3mj8yNbNvLLQ5R6edhihvhG72jfv5UnHFdP2c2m349Dtr59L5YaprBSAm5YWX2RS4rWdxhaxfVxd?cluster=devnet) |
| 21 | L. DFS claim_fee by shareholder (creator) | ok | [4MY6wJyM…CqcWyt](https://explorer.solana.com/tx/4MY6wJyM9BjQy8pBsr2Ah92LW41TTmcpztcjtcinF33JGYoe8id7AxGdeHaw2UpEX3kApHMdXL2QBzBYoYCqcWyt?cluster=devnet) |

Accounts:

- wallet: `5p5eiCR1oXzucmnSUNVpvkGMgapMgyTnmMYu6bYBGAL4`
- config: `Hu5gz6RAcpyVw73NT8hD6RvR27o9qj7bLGm1WhNEJhNK`
- mint: `HvAYdhDRgv6BcTLiuKkXzQz5m85dyaLkv5gaziytDAWz`
- pool: `8NaYq9znhY72k3vHA4PB8bT6wQJEph2HbtmDFqba9ond`
- feeVault: `9nbNjvGy49FxadSJbms7uHEuhPyCvEnLNLfFa5XsrrZx`
- rewardsPda: `7FfywkS52tv4isAxrWCtyUcU3fZHejeKLJS5Qy38cSuv`
- treasury: `EgPhNUDNeCbdWqxzxk9TZvt3rQ9yWnRWKPnCkgU8vTyz`
- buyer: `AvL2Qvw2TXWiHjV128pdhwk9Rboyuh2jKUXvGoo2VGS5`
- buyer2: `Cp1tuDtzMXjZorgV7zv96SqtmPr9Ss9HVe4NF2QU4xok`
- keeperConfig: `2u3p7tSSsMiRwiVPFyUitLatrBLzp4BC9Ytx5T5wX6t8`
- keeperPool: `BiNgUC1ZozNwbyRyeQ7kvWYPo7oymMfe2QWPjjxgFMSx`
- dammPool: `HSnGSwMn6ugqUhwH81jJQEQ2XkqvCByF62CeForkCrBF`
