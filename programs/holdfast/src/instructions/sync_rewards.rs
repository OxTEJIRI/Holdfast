use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::instructions::rewards::accumulate;
use crate::state::Launch;

/// Permissionless crank (DFS mode): claims the rewards PDA's share from the DFS fee vault
/// (`claim_fee(index)`, signed by the rewards PDA) into the rewards vault, then distributes it.
/// Before finalize it does nothing — the share keeps accruing inside DFS.
#[derive(Accounts)]
pub struct SyncRewards<'info> {
    #[account(mut, constraint = launch.fee_vault != Pubkey::default() @ HoldfastError::WrongFeeMode)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: PDA signer; DFS shareholder
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
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: must be `launch.fee_vault`; DFS validates the rest
    #[account(mut, address = launch.fee_vault @ HoldfastError::WrongFeeMode)]
    pub dfs_fee_vault: UncheckedAccount<'info>,
    /// CHECK: DFS fee-vault token account, validated by DFS (`has_one = token_vault`)
    #[account(mut)]
    pub dfs_token_vault: UncheckedAccount<'info>,
    /// CHECK: fixed DFS PDA
    #[account(address = dfs::FEE_VAULT_AUTHORITY)]
    pub dfs_fee_vault_authority: UncheckedAccount<'info>,
    /// CHECK: fixed DFS PDA
    #[account(address = dfs::EVENT_AUTHORITY)]
    pub dfs_event_authority: UncheckedAccount<'info>,
    /// CHECK: DFS program
    #[account(address = dfs::PROGRAM_ID)]
    pub dfs_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// `index` = the rewards PDA's position in the DFS vault's shareholder list (0 by SDK convention).
pub fn handle_sync_rewards(ctx: Context<SyncRewards>, index: u8) -> Result<()> {
    if !ctx.accounts.launch.finalized {
        return Ok(());
    }

    let mint = ctx.accounts.launch.mint;
    let bump = ctx.bumps.rewards_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[REWARDS_SEED, mint.as_ref(), &[bump]]];
    let mut data = dfs::CLAIM_FEE_DISC.to_vec();
    data.push(index);
    let ix = Instruction {
        program_id: dfs::PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.dfs_fee_vault.key(), false),
            AccountMeta::new_readonly(ctx.accounts.dfs_fee_vault_authority.key(), false),
            AccountMeta::new(ctx.accounts.dfs_token_vault.key(), false),
            AccountMeta::new_readonly(ctx.accounts.quote_mint.key(), false),
            AccountMeta::new(ctx.accounts.rewards_vault.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rewards_authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.dfs_event_authority.key(), false),
            AccountMeta::new_readonly(ctx.accounts.dfs_program.key(), false),
        ],
        data,
    };
    invoke_signed(
        &ix,
        &[
            ctx.accounts.dfs_fee_vault.to_account_info(),
            ctx.accounts.dfs_fee_vault_authority.to_account_info(),
            ctx.accounts.dfs_token_vault.to_account_info(),
            ctx.accounts.quote_mint.to_account_info(),
            ctx.accounts.rewards_vault.to_account_info(),
            ctx.accounts.rewards_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.dfs_event_authority.to_account_info(),
            ctx.accounts.dfs_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    ctx.accounts.rewards_vault.reload()?;
    let launch_key = ctx.accounts.launch.key();
    let vault_amount = ctx.accounts.rewards_vault.amount;
    accumulate(&mut ctx.accounts.launch, launch_key, vault_amount);
    Ok(())
}
