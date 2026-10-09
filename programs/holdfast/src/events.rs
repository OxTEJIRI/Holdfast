use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TransferKind {
    Buy,
    Sell,
    Transfer,
}

#[event]
pub struct LaunchCreated {
    pub launch: Pubkey,
    pub mint: Pubkey,
    pub dbc_pool: Pubkey,
    pub creator: Pubkey,
    pub fee_vault: Pubkey,
    pub launch_ts: i64,
    pub window_secs: u32,
    pub snipe_lock_secs: u32,
    pub max_wallet_bps: u16,
}

#[event]
pub struct HolderRegistered {
    pub launch: Pubkey,
    pub holder: Pubkey,
    pub owner: Pubkey,
    pub token_account: Pubkey,
    pub tracked_balance: u64,
    pub ts: i64,
}

/// Emitted by the transfer hook on every hooked transfer (for indexers / the Arena feed).
#[event]
pub struct HookEvent {
    pub mint: Pubkey,
    pub kind: TransferKind,
    pub source: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    /// Points forfeited by the source on this transfer.
    pub forfeited: u128,
    pub ts: i64,
}

#[event]
pub struct LaunchFinalized {
    pub launch: Pubkey,
    pub final_ts: i64,
    pub final_total_points: u128,
    pub total_tracked: u64,
}

#[event]
pub struct RewardsAdded {
    pub launch: Pubkey,
    pub amount: u64,
    pub acc_reward_per_point: u128,
    pub total_rewards_in: u64,
}

#[event]
pub struct RewardsClaimed {
    pub launch: Pubkey,
    pub holder: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub final_points: u128,
}
