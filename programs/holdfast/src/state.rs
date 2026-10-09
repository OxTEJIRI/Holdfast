use anchor_lang::prelude::*;

use crate::math::accrue;

/// One per Holdfast launch. PDA ["launch", mint].
#[account]
#[derive(InitSpace, Default)]
pub struct Launch {
    pub mint: Pubkey,
    pub dbc_pool: Pubkey,
    pub dbc_config: Pubkey,
    pub creator: Pubkey,
    /// DFS fee vault, or `Pubkey::default()` in keeper (fallback) mode.
    pub fee_vault: Pubkey,
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
    /// Q64.64
    pub acc_reward_per_point: u128,
    pub total_rewards_in: u64,
    pub total_rewards_claimed: u64,
    pub holder_count: u32,
    pub bump: u8,
}

impl Launch {
    /// Brings `total_points` up to `now`. Must run before `total_tracked` changes.
    pub fn accrue_global(&mut self, now: i64) {
        self.total_points = accrue(self.total_points, self.total_tracked, self.global_last_ts, now);
        self.global_last_ts = self.global_last_ts.max(now);
    }

    pub fn window_end(&self) -> i64 {
        self.launch_ts.saturating_add(self.window_secs as i64)
    }

    pub fn in_window(&self, now: i64) -> bool {
        now < self.window_end()
    }

    pub fn max_wallet_amount(&self) -> u64 {
        crate::math::bps_of(self.total_supply, self.max_wallet_bps)
    }
}

/// One per registered token account (Token-2022 ATA). PDA ["holder", token_account] — keyed by the
/// token account key, never its data, so the DBC/Token-2022 resolver can derive it for a buyer whose
/// ATA doesn't exist yet (DESIGN.md §5.3).
#[account]
#[derive(InitSpace, Default)]
pub struct Holder {
    pub launch: Pubkey,
    pub token_account: Pubkey,
    /// Captured at register; Token-2022 ATAs have ImmutableOwner.
    pub owner: Pubkey,
    pub tracked_balance: u64,
    pub points: u128,
    pub last_ts: i64,
    pub unlock_ts: i64,
    /// Set lazily on first claim after finalize.
    pub final_points: u128,
    pub reward_debt: u128,
    pub claimed: u64,
    pub bump: u8,
}

impl Holder {
    pub fn accrue(&mut self, now: i64) {
        self.points = accrue(self.points, self.tracked_balance, self.last_ts, now);
        self.last_ts = self.last_ts.max(now);
    }
}
