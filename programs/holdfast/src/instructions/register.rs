use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::spl_token_2022::extension::{
    transfer_hook::TransferHook, BaseStateWithExtensions, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::Mint as MintState;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::events::HolderRegistered;
use crate::state::{Holder, Launch};

/// Idempotent. Registers the owner's Token-2022 ATA for this launch so it is tracked (and may
/// receive tokens during the opening window). Clients prepend
/// `createAssociatedTokenAccountIdempotent` + `register` before a first buy.
#[derive(Accounts)]
pub struct Register<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub launch: Box<Account<'info, Launch>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_2022_program,
    )]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Holder::INIT_SPACE,
        seeds = [HOLDER_SEED, token_account.key().as_ref()],
        bump,
    )]
    pub holder: Box<Account<'info, Holder>>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register(ctx: Context<Register>) -> Result<()> {
    if ctx.accounts.holder.launch != Pubkey::default() {
        return Ok(()); // already registered
    }

    // Registration only makes sense while the hook is live (bonding phase).
    let launch = &mut ctx.accounts.launch;
    require!(!launch.finalized, HoldfastError::TradingClosed);
    {
        let info = ctx.accounts.mint.to_account_info();
        let data = info.try_borrow_data()?;
        let mint = StateWithExtensions::<MintState>::unpack(&data)?;
        let hook_live = mint
            .get_extension::<TransferHook>()
            .map(|h| Option::<Pubkey>::from(h.program_id) == Some(crate::ID))
            .unwrap_or(false);
        require!(hook_live, HoldfastError::TradingClosed);
    }

    let now = Clock::get()?.unix_timestamp;
    let balance = ctx.accounts.token_account.amount;
    launch.accrue_global(now);
    launch.total_tracked = launch.total_tracked.saturating_add(balance);
    launch.holder_count = launch.holder_count.saturating_add(1);

    let holder = &mut ctx.accounts.holder;
    holder.set_inner(Holder {
        launch: launch.key(),
        token_account: ctx.accounts.token_account.key(),
        owner: ctx.accounts.owner.key(),
        tracked_balance: balance,
        last_ts: now,
        bump: ctx.bumps.holder,
        ..Default::default()
    });

    emit!(HolderRegistered {
        launch: launch.key(),
        holder: holder.key(),
        owner: holder.owner,
        token_account: holder.token_account,
        tracked_balance: balance,
        ts: now,
    });
    Ok(())
}
