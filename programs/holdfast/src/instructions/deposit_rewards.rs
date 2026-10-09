use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::instructions::rewards::accumulate;
use crate::state::Launch;

/// Keeper (fallback) mode only (docs/VERIFICATION.md V6): the keeper that is the DBC fee claimer
/// deposits the holders' share of claimed fees. Deposits before finalize wait in the vault and are
/// distributed by the first deposit after it.
#[derive(Accounts)]
pub struct DepositRewards<'info> {
    pub depositor: Signer<'info>,
    #[account(mut, constraint = launch.fee_vault == Pubkey::default() @ HoldfastError::WrongFeeMode)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(
        mut,
        seeds = [REWARDS_VAULT_SEED, launch.mint.as_ref()],
        bump,
        token::mint = quote_mint,
        token::token_program = token_program,
    )]
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::authority = depositor, token::token_program = token_program)]
    pub depositor_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit_rewards(ctx: Context<DepositRewards>, amount: u64) -> Result<()> {
    if amount > 0 {
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.depositor_token_account.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.rewards_vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.quote_mint.decimals,
        )?;
    }
    ctx.accounts.rewards_vault.reload()?;
    let launch_key = ctx.accounts.launch.key();
    let vault_amount = ctx.accounts.rewards_vault.amount;
    accumulate(&mut ctx.accounts.launch, launch_key, vault_amount);
    Ok(())
}
