use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::extension::{
    transfer_hook::TransferHook, BaseStateWithExtensions, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::Mint as MintState;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::events::LaunchFinalized;
use crate::hook::read_u64;
use crate::state::Launch;

/// Permissionless. Freezes conviction at graduation: `final_ts` = the DBC pool's
/// `finish_curve_timestamp` (falls back to now if only the hook revocation is observable).
#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(mut, has_one = mint, has_one = dbc_pool)]
    pub launch: Box<Account<'info, Launch>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: address pinned by `has_one`; read raw
    pub dbc_pool: UncheckedAccount<'info>,
}

pub fn handle_finalize(ctx: Context<Finalize>) -> Result<()> {
    let launch = &mut ctx.accounts.launch;
    require!(!launch.finalized, HoldfastError::AlreadyFinalized);

    let finish_ts = {
        let data = ctx.accounts.dbc_pool.try_borrow_data()?;
        read_u64(&data, dbc_layout::POOL_FINISH_CURVE_TIMESTAMP)
    };
    let hook_revoked = {
        let info = ctx.accounts.mint.to_account_info();
        let data = info.try_borrow_data()?;
        let mint = StateWithExtensions::<MintState>::unpack(&data)?;
        mint.get_extension::<TransferHook>()
            .map(|h| Option::<Pubkey>::from(h.program_id).is_none())
            .unwrap_or(true)
    };
    require!(finish_ts != 0 || hook_revoked, HoldfastError::CurveNotComplete);

    let final_ts = if finish_ts != 0 { finish_ts as i64 } else { Clock::get()?.unix_timestamp };
    launch.accrue_global(final_ts);
    launch.final_ts = final_ts;
    launch.final_total_points = launch.total_points;
    launch.finalized = true;

    emit!(LaunchFinalized {
        launch: launch.key(),
        final_ts,
        final_total_points: launch.final_total_points,
        total_tracked: launch.total_tracked,
    });
    Ok(())
}
