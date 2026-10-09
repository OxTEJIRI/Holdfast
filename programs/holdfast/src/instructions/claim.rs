use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::events::RewardsClaimed;
use crate::math::{accrue, mul_shr64};
use crate::state::{Holder, Launch};

/// Pays a holder `final_points × acc_reward_per_point − already_paid` in the quote token.
/// Final points are computed lazily: after finalize a record can no longer change (the hook is
/// revoked and registration is closed), so recomputing them is idempotent.
#[derive(Accounts)]
pub struct Claim<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, holder.token_account.as_ref()],
        bump = holder.bump,
        has_one = owner,
        has_one = launch,
    )]
    pub holder: Box<Account<'info, Holder>>,
    /// CHECK: PDA signer of the rewards vault
    #[account(seeds = [REWARDS_SEED, launch.mint.as_ref()], bump)]
    pub rewards_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [REWARDS_VAULT_SEED, launch.mint.as_ref()],
        bump,
        token::mint = quote_mint,
        token::token_program = token_program,
    )]
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::token_program = token_program)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let launch = &mut ctx.accounts.launch;
    require!(launch.finalized, HoldfastError::NotFinalized);

    let holder = &mut ctx.accounts.holder;
    holder.final_points = accrue(holder.points, holder.tracked_balance, holder.last_ts, launch.final_ts);
    let entitled = mul_shr64(holder.final_points, launch.acc_reward_per_point).ok_or(HoldfastError::MathOverflow)?;
    let owed = entitled.saturating_sub(holder.reward_debt);
    // Never more than the vault holds (guards against accounting drift; rounding already favours the vault).
    let pay = owed.min(ctx.accounts.rewards_vault.amount as u128) as u64;
    require!(pay > 0, HoldfastError::NothingToClaim);

    let mint = launch.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[REWARDS_SEED, mint.as_ref(), &[ctx.bumps.rewards_authority]]];
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.rewards_vault.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.rewards_authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        pay,
        ctx.accounts.quote_mint.decimals,
    )?;

    holder.reward_debt = holder.reward_debt.saturating_add(pay as u128);
    holder.claimed = holder.claimed.saturating_add(pay);
    launch.total_rewards_claimed = launch.total_rewards_claimed.saturating_add(pay);

    emit!(RewardsClaimed {
        launch: launch.key(),
        holder: holder.key(),
        owner: holder.owner,
        amount: pay,
        final_points: holder.final_points,
    });
    Ok(())
}
