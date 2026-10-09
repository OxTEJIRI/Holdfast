# Holdfast — Design & Build Spec

> **Holdfast is a plug-in conviction layer for Meteora DBC launches.**
> A Token-2022 transfer hook scores every holder by *how much × how long* they hold, blocks
> snipe-and-dump in the first minutes, and turns that score into a **perpetual share of the
> launch's fees** — routed through Meteora Dynamic Fee Sharing, from the bonding curve and,
> after graduation, from the compounding DAMM v2 pool.
>
> Tagline: **Launches that reward the people who stay.**

Target: Superteam Earn listing *"Best use of Meteora's Dynamic Bonding Curve (DBC)"* (Crypto World's
Fair side track) **and** the main Colosseum Crypto World's Fair hackathon.

| Deadline | When |
|---|---|
| Colosseum Crypto World's Fair submission | **Oct 12, 2026** (confirm exact hour on colosseum.com/worldsfair) |
| Superteam / Meteora DBC listing | **Oct 13, 2026 06:59 UTC** |

---

## 0. Instructions for Claude Code (read first)

1. **Read this whole file before writing code.** Build strictly phase by phase (§10). Each phase
   has a *Definition of Done*; don't start the next phase until the current one passes.
2. **Never guess Meteora APIs.** Sources of truth, in order:
   - The installed SDK's `docs.md` and `.d.ts` files in `node_modules/@meteora-ag/dynamic-bonding-curve-sdk`
     (version ≥ 1.5.13 — transfer-hook support landed in 1.5.8/1.5.9).
   - The Meteora docs MCP (§0.1) and https://docs.meteora.ag/llms.txt
   - Program sources/IDLs on GitHub: `MeteoraAg/dynamic-bonding-curve`, `MeteoraAg/dynamic-bonding-curve-sdk`,
     `MeteoraAg/damm-v2`, `MeteoraAg/dynamic-fee-sharing`, `MeteoraAg/meteora-invent`.
3. **Phase 0 is a verification spike.** Several assumptions in this doc are marked
   `⚠ VERIFY`. Resolve every one in Phase 0, record findings in `docs/VERIFICATION.md`, and apply the
   listed fallback if an assumption is false. Don't silently redesign. If a fallback isn't listed,
   stop and ask the user.
4. Keep a running `PROGRESS.md` (what's done, what's next, open issues). Commit at the end of every phase
   with a clear message.
5. **Cost discipline:** no speculative features beyond this spec. Use the cheaper model for UI/boilerplate
   work and the strongest model for the on-chain program and the math. Prefer one solid test run over
   repeated review loops.
6. **Safety:** never commit keypairs, `.env`, or RPC keys (`.gitignore` them). **Ask the user before any
   mainnet deployment or any action that spends real SOL.** Devnet only by default.
7. Platform: the user is on **Windows 10**. All Rust/Solana/Anchor work happens in **WSL2 (Ubuntu)**.
   Keep the repo inside the WSL filesystem (`~/holdfast`) for build speed; copy this file there.

### 0.1 Tooling setup

```bash
# inside WSL2 Ubuntu
# Rust + Solana (Agave) CLI + Anchor via avm — use current stable versions; check `avm list`.
# Meteora's own programs currently use Anchor 1.0.x; match that major version.
claude mcp add --transport http meteora https://docs.meteora.ag/mcp
solana config set --url devnet
```

Node ≥ 22.12, pnpm ≥ 10 (same as Meteora's `fun-launch` scaffold).

---

## 1. Why this wins (map to the judging criteria)

| Judging criterion | How Holdfast scores |
|---|---|
| **Depth of Meteora stack integration** | DBC **transfer-hook pool** (Token-2022, newest DBC feature), custom curve + exponential anti-sniper fee scheduler + dynamic fee, `swap2WithTransferHook`, `claimPartnerTradingFee2`, DBC → **DAMM v2 migration in Compounding fee mode** with locked/vesting LP, **Dynamic Fee Sharing** PDA vault using `fund_by_claiming_fee` on whitelisted DBC + DAMM v2 claim actions. Five Meteora programs touched, all load-bearing. |
| **Technical execution** | A real on-chain Anchor program (transfer hook + rewards accumulator), a typed TS SDK, local-validator integration tests that run against the *real* Meteora programs, and a reproducible simulation. |
| **Originality / durability beyond the meme-stock trend** | Conviction rewards apply to any asset class launched on DBC (memes, AI tokens, RWAs, stock-paired launches). It's infrastructure, not a trend. |
| **Impact: new class of assets** | *Conviction-weighted tokens*: holding time becomes an on-chain, provable claim on a launch's cash flows. |
| **Traction** | Pitched as **infrastructure** ("any DBC launchpad adds this with one config change"), so we don't depend on user counts. Optional single mainnet launch at the end (§10, Phase 8). |

**What we deliberately don't build:** another meme launchpad (crowded), a stock-paired launchpad
(StockLaunch already exists), a pure preset marketplace (low impact).

---

## 2. Product in one picture

```
            ┌──────────────── BONDING PHASE (hook active) ────────────────┐   ┌──── GRADUATED ────┐
 create ──► │ buy/sell via DBC swap2WithTransferHook                       │──►│ DAMM v2 pool       │
 launch     │   └─► Token-2022 calls Holdfast hook on every transfer:      │   │ (Compounding mode) │
            │        • accrue conviction points (balance × seconds)        │   │ hook revoked by DBC│
            │        • snipe-lock: early buyers can't sell for N minutes   │   └─────────┬──────────┘
            │        • max-wallet cap during the opening window            │             │ LP fees (quote)
            │ DBC trading fees (quote) ──► partner fee claimer = DFS vault │             ▼
            └──────────────────────────────────────────────┬──────────────┘   DFS vault (same one)
                                                           ▼                          │
                                  Dynamic Fee Sharing vault (≤5 shareholders):        │
                                  [Holdfast Rewards PDA 60% | creator 30% | treasury 10%]
                                                           │◄─────────────────────────┘
                                                           ▼
                           Holdfast rewards accumulator ──► holders claim pro-rata to FINAL conviction
```

Holders' conviction is **frozen at graduation** (`finishCurveTimestamp`), and from then on it is a
**permanent fee share**: every later crank of bonding fees *and* DAMM v2 LP fees flows to them by score.

---

## 3. Core mechanics (precise rules)

### 3.1 Conviction points
- Unit: `token_base_units × seconds` (u128).
- Each tracked holder record keeps `tracked_balance`, `points`, `last_ts`.
- **Accrue** (before any change): `points += tracked_balance × (now − last_ts); last_ts = now`.
- **Incoming transfer of `a`:** accrue, then `tracked_balance += a`.
- **Outgoing transfer of `a`** (sell or wallet-to-wallet): accrue, then forfeit proportionally:
  `lost = points × min(a, b) / b` where `b = tracked_balance`; `points −= lost; tracked_balance −= min(a, b)`.
  (Selling 30% of your bag forfeits 30% of your points. Selling everything resets to zero.)
- Points are **linear in balance**, so splitting across wallets gives no advantage (sybil-neutral),
  and moving tokens between wallets forfeits points (no laundering of score).
- A global accumulator in `Launch` mirrors the sum: `total_points += total_tracked × (now − global_last_ts)`;
  forfeits are subtracted from `total_points`; balance deltas update `total_tracked`.
- Use saturating arithmetic on balances (a holder record can drift from the real token balance if the
  wallet held tokens before registering; never fail a transfer due to accounting underflow).

### 3.2 Protection rules (all bounded by hard-coded caps)
| Rule | Per-launch param | Hard cap (in program) | Effect |
|---|---|---|---|
| Opening window | `window_secs` | ≤ 600 s | Period after `launch_ts` where the rules below apply |
| Snipe-lock | `snipe_lock_secs` | ≤ 1800 s | A record that **receives** tokens during the window gets `unlock_ts = max(unlock_ts, now + snipe_lock_secs)`. **Any outgoing transfer** before `unlock_ts` is rejected (`SnipeLocked`). |
| Max wallet | `max_wallet_bps` (0 = off) | ≥ 50 bps if on | During the window, an incoming transfer that leaves the destination token account above `max_wallet_bps × supply` is rejected. |
| Registered receivers | — | — | During the window only, a transfer to an **unregistered** token account (except DBC's pool vault) is rejected (`RecipientNotRegistered`). Stops bundlers from spraying fresh wallets to dodge the lock. |

**Provably-not-a-honeypot guarantee** (put this in the UI and README):
after `launch_ts + window_secs + snipe_lock_secs` (≤ 40 minutes worst case) the hook **cannot reject
any transfer**, and DBC **revokes the hook entirely at graduation**. Params are fixed at launch and
can't be changed. Make the program immutable before any mainnet use.

### 3.3 Direction & special accounts
- `DBC_POOL_AUTHORITY` = PDA of seeds `["pool_authority"]` under the DBC program
  `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`. Derive it and cross-check against the SDK constant.
- Source token account owner == pool authority → **buy** (from the pool's base vault).
- Destination owner == pool authority → **sell**.
- The pool vault is never tracked and never blocked as a destination (except via the seller's snipe-lock).
- Same-owner transfers (source owner == destination owner) skip forfeiture.

### 3.4 Rewards
- At graduation, each record's **final points** = `points + tracked_balance × (final_ts − last_ts)`,
  where `final_ts` = DBC virtual pool `finishCurveTimestamp`. `final_total_points` is computed the same way globally.
- Rewards accumulator (classic reward-per-share, Q64.64 fixed point in u128, mul-div through U256):
  `acc_reward_per_point += (new_rewards << 64) / final_total_points`.
  A holder is owed `(final_points × acc_reward_per_point >> 64) − reward_debt`.
- Rewards are in the **quote token** (wSOL on devnet). Claim unwraps to SOL in the client.
- Rewards keep flowing **forever** after graduation as DAMM v2 LP fees are cranked into the DFS vault.

---

## 4. Meteora configuration

### 4.1 Per-launch DBC config (one config per launch)
Built with SDK curve builders (`buildCurveWithMarketCap` by default; `buildCurveWithLiquidityWeights`
for the "Slow Burn" preset), then `client.partner.createConfigWithTransferHook({ ..., transferHookProgram: HOLDFAST_PROGRAM_ID })`.

| Field | Value | Why |
|---|---|---|
| `tokenType` | `Token2022` | Required for transfer-hook pools |
| `tokenAuthorityOption` | `Immutable` (`1`) — ⚠ VERIFY allowed for hook configs | No mint/metadata rug |
| `tokenBaseDecimal` | 6 | |
| `totalTokenSupply` | 1,000,000,000 | |
| `quoteMint` | `NATIVE_MINT` (wSOL) | Simple on devnet; DFS vault mint = wSOL |
| `collectFeeMode` | `QuoteToken` | All fees in SOL; avoids base-token fee transfers through the hook |
| base fee | `FeeSchedulerExponential`, start high → end 1% (see presets) | Fee-based anti-sniper (layered with the hook) |
| `dynamicFeeEnabled` | `true` | Volatility fee |
| `creatorTradingFeePercentage` | **0** | 100% of the non-protocol fee goes to the partner side = the DFS vault, which then splits to holders/creator/treasury |
| `feeClaimer` | **DFS fee-vault PDA** for this launch (§4.3) | Makes fee routing trustless |
| `leftoverReceiver` | treasury | |
| `migrationOption` | DAMM v2 (`1`) | Required for Token-2022 |
| `migrationFeeOption` | `Customizable` (`6`) | Needed for a custom migrated-pool fee |
| `migratedPoolFee` | `collectFeeMode: 2 (Compounding)`, `compoundingFeeBps: 5000`, `poolFeeBps: 100`, `dynamicFee: 1` | Graduated pool deepens itself; half of LP fees stay claimable and flow to holders |
| LP distribution | partner **permanently locked 50%**; creator 50% **vesting** (e.g. 7-day cliff, 90 days) | Partner LP is owned by the DFS vault → perpetual holder fees. Creator can't dump LP. Satisfies the ≥10%-locked-on-day-1 rule. |
| `activationType` | `Timestamp` | Hook rules are time-based |
| `migrationQuoteThreshold` | preset-dependent (devnet: tiny) | |

Confirm every field name against the installed SDK; the SDK validates the config and throws on invalid
combinations, so build a `validateConfig()` unit test per preset.

### 4.2 Presets (`packages/sdk/src/presets.ts`)
| Preset | Use | Fee scheduler | Hook rules | Graduation threshold | DFS split holders/creator/treasury |
|---|---|---|---|---|---|
| **Fair Launch** | memes, AI tokens | 50% → 1% exponential over 120 s | window 120 s, lock 900 s, max wallet 150 bps | mainnet 80 SOL / devnet 3 SOL | 60 / 30 / 10 |
| **Slow Burn** | community, RWA-style raises | 25% → 1% over 300 s, liquidity-weighted curve | window 300 s, lock 1800 s, max wallet 100 bps | mainnet 200 SOL / devnet 5 SOL | 70 / 25 / 5 |
| **Arena (demo)** | the live simulation | 30% → 1% over 30 s | window 45 s, lock 150 s, max wallet 300 bps | devnet 2 SOL | 60 / 30 / 10 |

### 4.3 Dynamic Fee Sharing (DFS) — facts verified from source
- Program `dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh`. **`MAX_USER = 5`** shareholders per vault,
  so DFS can't pay holders directly. It splits between ≤5 parties; Holdfast does the per-holder split.
- PDA vault: `initialize_fee_vault_pda`, seeds `["fee_vault", base, token_mint]`. `base` must sign;
  **use the DBC config keypair as `base`** (it signs config creation anyway).
- `fund_by_claiming_fee(payload)`: the DFS vault PDA is passed **as signer** into a whitelisted CPI.
  Whitelist includes DBC `ClaimTradingFee2` (partner fee on hook pools), `ClaimCreatorTradingFee2`,
  `WithdrawMigrationFee`, `PartnerWithdrawSurplus`, and DAMM v2 `ClaimPositionFee`. **The caller must be
  a shareholder of the vault.**
  ⇒ DBC `feeClaimer` = the DFS vault PDA; the partner's migrated LP position must be owned by the
  same PDA (⚠ VERIFY partner LP position owner = `feeClaimer`).
- Shareholders for each launch: `[holdfast_rewards_pda(mint), creator_wallet, treasury_wallet]`.
- `claim_fee(index)` requires the shareholder to sign → Holdfast's program CPIs it with the rewards PDA seeds.

**Fallback (if DFS isn't on devnet or the PDA-as-feeClaimer flow fails):** set `feeClaimer` = a keeper
keypair; the keeper calls `claimPartnerTradingFee2` and then Holdfast `deposit_rewards` with the holders'
share. Same UX, one trust assumption; document it in the README. Keep the DFS path for mainnet if it works there.

---

## 5. On-chain program: `programs/holdfast` (Anchor)

### 5.1 Accounts
```rust
#[account]
pub struct Launch {                  // PDA ["launch", mint]
    pub mint: Pubkey,
    pub dbc_pool: Pubkey,
    pub dbc_config: Pubkey,
    pub creator: Pubkey,
    pub fee_vault: Pubkey,           // DFS vault (or Pubkey::default() in fallback mode)
    pub launch_ts: i64,
    pub window_secs: u32,
    pub snipe_lock_secs: u32,
    pub max_wallet_bps: u16,
    pub total_supply: u64,
    pub total_tracked: u64,
    pub total_points: u128,
    pub global_last_ts: i64,
    // finalization + rewards
    pub finalized: bool,
    pub final_ts: i64,
    pub final_total_points: u128,
    pub acc_reward_per_point: u128,  // Q64.64
    pub total_rewards_in: u64,
    pub total_rewards_claimed: u64,
    pub holder_count: u32,
    pub bump: u8,
}

#[account]
pub struct Holder {                  // PDA ["holder", token_account]  ← keyed by TOKEN ACCOUNT, see 5.3
    pub launch: Pubkey,
    pub token_account: Pubkey,
    pub owner: Pubkey,               // captured at register; Token-2022 ATAs have ImmutableOwner
    pub tracked_balance: u64,
    pub points: u128,
    pub last_ts: i64,
    pub unlock_ts: i64,
    pub final_points: u128,          // set lazily on first claim after finalize
    pub reward_debt: u128,
    pub claimed: u64,
    pub bump: u8,
}
```
Plus the standard `ExtraAccountMetaList` PDA `["extra-account-metas", mint]` and a rewards token
account (wSOL) owned by the `["rewards", mint]` PDA, which is also the DFS shareholder.

### 5.2 Instructions
| Ix | Who | What |
|---|---|---|
| `init_launch(params)` | creator (signer), payer | Must be in the **same transaction** as DBC pool creation, right after it (the mint is created in that tx, so nobody can front-run this). Validates param caps; checks the mint's TransferHook extension `program_id == holdfast::ID`; creates `Launch`, `ExtraAccountMetaList`, rewards PDA + token account. `launch_ts = Clock::unix_timestamp`. |
| `register()` | owner (signer), payer | Idempotent. Creates the `Holder` for `(launch, token_account)`, requires `token_account.owner == owner` and mint match; sets `tracked_balance = token_account.amount`, `last_ts = now`, updates launch totals. Clients prepend `createAssociatedTokenAccountIdempotent` + `register` before the first buy. |
| `execute` (transfer-hook interface) | Token-2022 CPI | §5.4 |
| `finalize()` | anyone | Requires the DBC virtual pool to be complete (`finishCurveTimestamp != 0`, read from the DBC pool account; ⚠ VERIFY field offset via DBC IDL) **or** the mint's TransferHook `program_id` to be `None`. Sets `final_ts`, `final_total_points`, `finalized = true`. |
| `sync_rewards()` | anyone (crank) | CPI DFS `claim_fee(index)` signed by the rewards PDA → measure the rewards-vault balance delta → `acc_reward_per_point += (delta << 64) / final_total_points`. Before finalize: no-op (funds sit in DFS until then). |
| `deposit_rewards(amount)` | keeper | **Fallback mode only**: transfer quote into the rewards vault and update the accumulator. |
| `claim()` | holder owner (signer) | Requires finalized; computes `final_points` lazily on first call; pays `owed` from the rewards vault; updates `reward_debt`/`claimed`. |
| `close_holder()` | owner | Optional, after claiming: closes the record for rent refund (stretch). |

Use `declare_program!` (or the IDLs from Meteora's repos) for typed CPI into DFS and to deserialize
the DBC virtual pool account.

### 5.3 ExtraAccountMetaList design ⚠ important gotcha
The DBC SDK resolves hook extra accounts automatically when it builds swaps, using the on-chain
`ExtraAccountMetaList`. A first-time buyer's token account **doesn't exist yet at build time**, so any
seed that reads account *data* (e.g. the owner field) can't be resolved. Therefore:

- Holder PDAs are seeded by the **token account key**, never by its data:
  - extra[0] `launch` = PDA `["launch", mint]` → `Seed::Literal("launch"), Seed::AccountKey{index: 1}`
  - extra[1] `src_holder` = PDA `["holder", source]` → `Seed::AccountKey{index: 0}` (writable)
  - extra[2] `dst_holder` = PDA `["holder", destination]` → `Seed::AccountKey{index: 2}` (writable)
  - `launch` is writable.
  (Execute account order: 0 source, 1 mint, 2 destination, 3 authority, 4 extra-meta-list, then extras.)
- Holder PDAs that don't exist are passed as uninitialized system accounts. The hook must treat them as
  "unregistered", not fail.
- Since ATAs are 1 per (owner, mint) and Token-2022 ATAs have `ImmutableOwner`, keying by token account
  is effectively per-wallet.

### 5.4 `execute(amount)` algorithm
```
assert source token account is in "transferring" state (standard transfer-hook check)
assert mint == launch.mint
now = Clock.unix_timestamp
accrue_global(launch, now)

src_owner = read owner from source token account data (offset 32)
dst_owner = read owner from destination token account data (offset 32)
is_buy  = src_owner == DBC_POOL_AUTHORITY
is_sell = dst_owner == DBC_POOL_AUTHORITY
in_window = now < launch.launch_ts + window_secs

if src_holder initialized:
    require!(now >= src.unlock_ts, SnipeLocked)
    accrue(src, now)
    if src_owner != dst_owner: forfeit(src, launch, amount)
    src.tracked_balance -= min(amount, src.tracked_balance); launch.total_tracked -= same

if !is_sell:
    if dst_holder initialized:
        accrue(dst, now)
        dst.tracked_balance += amount; launch.total_tracked += amount
        if in_window: dst.unlock_ts = max(dst.unlock_ts, now + snipe_lock_secs)
    else if in_window:
        err RecipientNotRegistered
    if in_window && max_wallet_bps > 0:
        require!(dst_token_account.amount <= supply * max_wallet_bps / 10_000, MaxWalletExceeded)

emit HookEvent { kind: Buy|Sell|Transfer, src, dst, amount, ts }   // msg-log event for indexers
```
Note: Token-2022 runs the hook **after** balances are updated, so `dst_token_account.amount` is post-transfer.
Keep compute < 30k CU; no heap allocation in the hot path.

### 5.5 Errors
`SnipeLocked`, `RecipientNotRegistered`, `MaxWalletExceeded`, `ParamOutOfBounds`, `WrongHookProgram`,
`NotTransferring`, `NotFinalized`, `AlreadyFinalized`, `CurveNotComplete`, `MathOverflow`, `NothingToClaim`.
Error messages must be human-readable. The UI shows them verbatim (e.g. *"Snipe-locked until 14:32:05"*).

### 5.6 Tests (`tests/`, Anchor + local validator)
Load the **real** Meteora programs into the local validator (`solana program dump -u m <id> <file>.so`,
plus `[[test.genesis]]` in `Anchor.toml`): DBC, DAMM v2, DFS, plus required DAMM v2 config/global accounts
(clone with `--clone` / `[[test.validator.clone]]` from devnet or mainnet as needed).

Required cases:
1. Config with hook → pool + `init_launch` in one tx → buy via `swap2WithTransferHook` works.
2. Points accrue linearly (warp clock); two holders with 2:1 balance have 2:1 points.
3. Partial sell forfeits proportionally; full sell → 0.
4. Buy in window → sell before unlock fails `SnipeLocked`; succeeds after.
5. Transfer to unregistered account in window fails; after window succeeds.
6. Max-wallet in window fails; after window passes.
7. Hook rejects nothing after window + lock (fuzz random transfers).
8. Curve completes → hook revoked → `finalize` → plain transfers work.
9. Migration to DAMM v2 succeeds; pool is Compounding mode.
10. DFS `fund_by_claiming_fee` (DBC partner fee) → `sync_rewards` → claims sum ≤ deposited (rounding dust stays in vault) and match the expected pro-rata within 1 lamport.
11. DAMM v2 LP fee claim into DFS after migration → second `sync_rewards` → holders can claim again.
12. Overflow tests at max supply × max duration.

---

## 6. TypeScript SDK: `packages/sdk` (`@holdfast/sdk`)

Thin, typed wrapper so other launchpads can integrate in three calls. Exports:

```ts
presets: Record<'fairLaunch'|'slowBurn'|'arena', HoldfastPreset>
buildHoldfastConfig(preset, overrides, { network }): ConfigParameters   // wraps DBC buildCurve*
createLaunch(conn, { creator, name, symbol, uri, preset, split, firstBuySol? })
  → { mint, config, pool, feeVault, txs: Transaction[] }   // see 6.1
buy(conn, { owner, mint, solIn, slippageBps })      // prepends ATA + register (idempotent)
sell(conn, { owner, mint, tokensIn, slippageBps })
getLaunch(conn, mint), getHolder(conn, tokenAccount), getLeaderboard(conn, mint, limit)
projectedShare(holder, launch, now)                  // live % of rewards if graduation happened now
finalize(conn, mint), crank(conn, mint), claim(conn, owner, mint)
explainError(err): string                            // maps program errors → friendly text
```

### 6.1 Launch transaction sequence
1. **Tx A:** DFS `initialize_fee_vault_pda` (base = config keypair, token_mint = wSOL, users = [rewards PDA(mint), creator, treasury]).
   The mint keypair is generated client-side first, so `rewards PDA(mint)` is known.
2. **Tx B:** `createConfigWithTransferHook` (feeClaimer = DFS vault PDA).
3. **Tx C (atomic):** `createPoolWithTransferHook` → Holdfast `init_launch` → creator `register` → optional creator first buy.
   If too large, use an Address Lookup Table. If the SDK's combined `createPoolWithFirstBuyWithTransferHook`
   can't take our ix in between, do the first buy as Tx D.

⚠ VERIFY: DBC doesn't require the `ExtraAccountMetaList` to exist at pool-creation time (it's created right after, in the same tx).

---

## 7. Web app: `apps/web`

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind, `@solana/wallet-adapter` (Phantom,
Solflare, Backpack), Recharts (or lightweight-charts) for charts. Don't fork the full `fun-launch` scaffold.
Its R2 storage and Jupiter data APIs don't fit a devnet transfer-hook demo. Borrow patterns and components
from it where useful. Token metadata JSON is served by `app/api/metadata/[mint]/route.ts` (store in a
small JSON file or KV; images under `public/`).

**Design direction:** confident, calm and trustworthy, not casino. Dark-first, one accent colour
(deep teal or amber), big numbers, a "conviction meter" ring as the signature visual. Every rule shown
with a countdown. Mobile-friendly.

### Pages
| Route | Content |
|---|---|
| `/` | Hero + one-line pitch, 3-step "how it works", the provable-safety timeline, links to Arena, Launch, Developers. |
| `/launch` | Wizard: (1) token name/symbol/image, (2) preset cards, (3) advanced sliders clamped to program caps, (4) reward split (holders ≥ 50% enforced in UI), (5) **live curve preview** (price vs quote raised, from the config's curve points; formulas: docs.meteora.ag/core-products/dbc/formulas), (6) review + sign the 3–4 txs with progress steps. |
| `/t/[mint]` | Curve progress (`getPoolQuoteTokenCurveProgress`), buy/sell panel, **Your conviction** ring (points, live projected share %, lock countdown, forfeiture preview *"selling 25% costs you 25% of your points"*), leaderboard (top 20 by projected share), rules card with a timeline (window → lock → free trading → graduation), rewards panel (claimable, Claim button, lifetime earned), post-graduation link to the DAMM v2 pool. |
| `/arena` | Live dashboard for the simulation (§8): bot cards by persona, event feed (`SnipeLocked ✋`, `RecipientNotRegistered ✋`, `MaxWalletExceeded ✋`, buys/sells), leaderboard, curve progress, and a final **"Who got paid?"** chart: rewards per SOL invested by persona. |
| `/developers` | "Add Holdfast to your DBC launchpad in 3 calls": code samples from the SDK, program ID, account diagram, safety caps, link to GitHub. |

Data: poll or subscribe (`onProgramAccountChange` on the Holdfast program, filtered by `launch`). The Arena
feed reads `sim/out/events.jsonl` through an SSE route `app/api/arena/stream/route.ts`.

---

## 8. The Arena simulation: `sim/`

Proves the mechanics without real users. It's also the centrepiece of the demo video.

- `sim/fund.ts`: creates N bot keypairs (`sim/.keys/`, gitignored), funds them from one devnet wallet.
  Total budget ≈ **10–12 devnet SOL** (use faucet.solana.com, GitHub login for higher limits).
- `sim/run.ts`: creates an **Arena preset** launch, then runs personas on a timeline:

| Persona | Count | Behaviour | Expected outcome |
|---|---|---|---|
| Sniper | 3 | buy at t+2 s, try to dump at t+15 s, retry every 10 s | blocked by `SnipeLocked` until unlock; most points forfeited when they finally sell |
| Bundler | 1 | buy into 5 fresh unregistered wallets in-window | blocked by `RecipientNotRegistered` |
| Whale | 1 | try to buy 8% of supply in-window | blocked by `MaxWalletExceeded`; buys after the window |
| Flipper | 6 | buy after window, sell after 30–90 s | small/zero final points |
| Holder | 10 | buy in small steady clips, never sell | dominate the leaderboard |
| Closer | 1 | pushes the curve to completion | triggers graduation |

  Then: migrate (`client.migration.migrateToDammV2`) → `finalize` → crank DFS + `sync_rewards` → a few
  post-graduation swaps on DAMM v2 to generate LP fees → crank again → all bots claim.
- Output: `sim/out/events.jsonl` (live feed), `sim/out/summary.json` (rewards per SOL by persona,
  blocked attempts count, Solana Explorer links for key txs).
- **Success metric for the pitch:** Holders' rewards per SOL invested ≥ **5×** Flippers' and Snipers'. Tune the timeline until true.
- `--speed` flag scales all timings for a 3–4 minute recordable run.

---

## 9. Repo layout

```
holdfast/
├─ DESIGN.md            ← this file
├─ PROGRESS.md
├─ README.md            ← judges read this first (pitch, demo video, how to run, program IDs)
├─ Anchor.toml  Cargo.toml  package.json  pnpm-workspace.yaml
├─ programs/holdfast/src/{lib.rs, state.rs, errors.rs, math.rs, hook.rs, instructions/*.rs}
├─ tests/               ← anchor integration tests (real Meteora programs loaded)
├─ fixtures/            ← dumped .so files + cloned accounts (gitignored if large; script to fetch)
├─ packages/sdk/src/{index.ts, presets.ts, launch.ts, trade.ts, rewards.ts, pda.ts, errors.ts}
├─ apps/web/            ← Next.js app
├─ sim/                 ← Arena simulation
├─ scripts/             ← deploy.ts, create-launch.ts, crank.ts, fetch-fixtures.sh
└─ docs/{VERIFICATION.md, ARCHITECTURE.md, pitch-deck.md, video-script.md}
```

---

## 10. Build phases

Rough time budget assumes ~3.5 days to the Oct 12 Colosseum deadline. **Cut lines** in §11.

### Phase 0: Environment + verification spike (≈ 3–4 h) ⛳ gate
1. WSL2 toolchain, Anchor, Solana CLI, Node/pnpm, Meteora MCP. `anchor init`-style workspace per §9.
2. Deploy a **no-op** transfer-hook program to devnet (implements `execute` that just logs, plus `ExtraAccountMetaList` init).
3. With the DBC SDK on devnet: `createConfigWithTransferHook` → `createPoolWithTransferHook` → init meta list in the same tx → `swap2WithTransferHook` buy & sell → push to completion → confirm the hook is revoked → `migrateToDammV2` with Compounding mode.
4. Resolve and record every `⚠ VERIFY`:
   - [ ] Transfer-hook pools work on devnet (same DBC program ID).
   - [ ] `tokenAuthorityOption = Immutable` accepted for hook configs (else use `CreatorUpdateAuthority`).
   - [ ] Meta list can be created after pool init in the same tx.
   - [ ] SDK auto-resolves our extra accounts for a first-time buyer (key-based seeds).
   - [ ] `finishCurveTimestamp` location in the DBC pool account (for `finalize`).
   - [ ] DFS deployed on devnet; a DFS vault PDA works as DBC `feeClaimer` via `fund_by_claiming_fee` + `ClaimTradingFee2`.
   - [ ] Partner's migrated DAMM v2 position is owned by `feeClaimer` and claimable via DFS `ClaimPositionFee`.
   - [ ] Which `dammConfig` key to pass to `migrateToDammV2` for Customizable fees.
   - [ ] Pool-authority PDA address.
5. **DoD:** a devnet tx list in `docs/VERIFICATION.md` proving steps 2–3, every checkbox resolved, fallbacks chosen.

### Phase 1: Hook + conviction accounting (≈ 6–8 h)
`Launch`, `Holder`, `init_launch`, `register`, `execute`, the math module with unit tests, errors, events.
**DoD:** tests 1–8 and 12 from §5.6 pass on the local validator with the real DBC program.

### Phase 2: Graduation + rewards (≈ 4–6 h)
`finalize`, `sync_rewards` (DFS CPI), `claim`, fallback `deposit_rewards`, launch tx sequence (§6.1).
**DoD:** tests 9–11 pass; a scripted end-to-end devnet run produces non-zero claims.

### Phase 3: SDK (≈ 3 h)
`@holdfast/sdk` per §6, presets, `explainError`, typed PDAs.
**DoD:** `scripts/create-launch.ts` and the sim use only the SDK; type-check clean.

### Phase 4: Arena simulation (≈ 3 h)
Per §8. **DoD:** one command runs the whole story on devnet; `summary.json` shows the ≥5× result.

### Phase 5: Web app (≈ 8–10 h)
Per §7. Order: `/t/[mint]` → `/arena` → `/launch` → `/` → `/developers`.
**DoD:** a fresh wallet can launch, buy (auto-register), see conviction grow, hit a snipe-lock with a clear
message, and claim after graduation, all on devnet. Deployed to Vercel.

### Phase 6: Hardening + docs (≈ 2–3 h)
Re-run all tests; quick self-review of the program for: missing account checks (mint, PDA seeds,
owner, `transferring` flag), arithmetic overflow, rounding direction (always round **down** on payouts),
can't-claim-twice, and the "never blocks after T+40 min" invariant. README with program IDs,
architecture diagram, how to run, the honeypot-safety argument.

### Phase 7: Submission pack (≈ 3 h, user-led with Claude support)
- `docs/video-script.md`: 2–3 min: problem (snipers/flippers, 10 s) → idea (10 s) → Arena run (90 s) → "3 calls to integrate" (20 s) → Meteora stack depth (20 s) → close.
- `docs/pitch-deck.md`: ~8 slides: Problem, Insight, How it works, Provable safety, Meteora stack diagram, Arena results, Integration, Roadmap (stock-paired mode, AI launch copilot, mainnet).
- Repo public on GitHub (if ever private: grant read access to GitHub user `dannxbt`).
- Submit to **Colosseum** (Oct 12) and the **Superteam listing** (Oct 13 06:59 UTC). Superteam form needs:
  project name, description, GitHub link, website (Vercel), X link, deck or video link, Colosseum yes/no + links.

### Phase 8: Optional mainnet (only with the user's explicit go-ahead)
Deploy the program (~2–3 SOL rent, mostly recoverable), run one Fair Launch preset, link it in the
submission. Make the program immutable if it will hold real users' tokens.

---

## 11. Cut lines (if behind schedule, cut in this order)
1. `/developers` page → fold into README.
2. Max-wallet rule (keep snipe-lock + registration).
3. Post-graduation DAMM v2 LP fee streaming (keep bonding-fee rewards; mention as roadmap).
4. DFS routing → keeper fallback (`deposit_rewards`).
5. `/launch` wizard → launches via script only; the web app keeps `/t/[mint]` + `/arena`.

**Never cut:** the hook + conviction math, the snipe-lock, finalize + claim, the Arena run, the demo video.

---

## 12. Stretch goals (only after Phase 7 is done)
- **Stock-paired mode:** quote mint = a tokenized stock, so rewards are paid in shares (mainnet only; Token-2022 quote mints may need a token badge).
- **AI launch copilot:** describe your launch in plain English → Claude proposes a preset + params → validated by the SDK.
- Holder record close/rent refund; leaderboard indexer; Jupiter routing notes for hook tokens.

---

## 13. Known limitations (say these honestly in the README)
- During the bonding phase, trading routes only through clients that pass transfer-hook accounts (our UI/SDK, DBC SDK). Aggregator support for hook tokens may be limited. After graduation the hook is gone and the token trades anywhere.
- Conviction tracks registered token accounts; tokens held in unregistered accounts earn nothing.
- Fallback mode (if used) trusts a keeper to deposit rewards.
- Not audited; devnet demonstration.

---

## 14. Reference
- Listing: https://superteam.fun/earn/listing/meteora-dbc
- DBC overview: https://docs.meteora.ag/core-products/dbc/what-is-dbc
- Transfer-hook pools: https://docs.meteora.ag/core-products/dbc/transfer-hook-pools
- DBC SDK transfer hooks: https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/transfer-hooks
- DBC SDK full reference: `packages/dynamic-bonding-curve/docs.md` in `MeteoraAg/dynamic-bonding-curve-sdk`
- Launch configuration: https://docs.meteora.ag/core-products/dbc/launch-configurations
- Fees: https://docs.meteora.ag/core-products/dbc/fees/overview
- Migration: https://docs.meteora.ag/core-products/dbc/migration-and-liquidity
- DAMM v2 compounding: https://docs.meteora.ag/core-products/damm-v2/compounding-liquidity
- Dynamic Fee Sharing SDK: https://docs.meteora.ag/developer-guides/dynamic-fee-sharing/typescript-sdk/getting-started
- DFS source: https://github.com/MeteoraAg/dynamic-fee-sharing
- fun-launch scaffold: https://github.com/MeteoraAg/meteora-invent
- Docs MCP: `claude mcp add --transport http meteora https://docs.meteora.ag/mcp`
- Program IDs: DBC `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` · DFS `dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh`
