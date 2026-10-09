//! Rewards accumulator (DESIGN.md §3.4): classic reward-per-point, Q64.64, over FINAL points.

use anchor_lang::prelude::*;

use crate::events::RewardsAdded;
use crate::math::reward_per_point;
use crate::state::Launch;

/// Distributes whatever sits in the rewards vault beyond what is already owed to holders.
/// Anything that reaches the vault (DFS claims, keeper deposits, donations) is picked up here.
/// Before finalize (or with zero final points) it is a no-op and the funds simply wait.
pub fn accumulate(launch: &mut Launch, launch_key: Pubkey, vault_amount: u64) -> u64 {
    if !launch.finalized || launch.final_total_points == 0 {
        return 0;
    }
    let outstanding = launch.total_rewards_in.saturating_sub(launch.total_rewards_claimed);
    let amount = vault_amount.saturating_sub(outstanding);
    if amount == 0 {
        return 0;
    }
    launch.acc_reward_per_point = launch
        .acc_reward_per_point
        .saturating_add(reward_per_point(amount, launch.final_total_points));
    launch.total_rewards_in = launch.total_rewards_in.saturating_add(amount);
    emit!(RewardsAdded {
        launch: launch_key,
        amount,
        acc_reward_per_point: launch.acc_reward_per_point,
        total_rewards_in: launch.total_rewards_in,
    });
    amount
}
