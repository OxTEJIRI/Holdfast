//! Phase 0 spike: a no-op transfer hook with the same extra-account layout as the real Holdfast
//! design (DESIGN.md §5.3). `execute` only logs. Replaced by the real hook in Phase 1.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, InitializeExtraAccountMetaListInstruction};

declare_id!("E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw");

#[program]
pub mod holdfast {
    use super::*;

    /// Creates the ExtraAccountMetaList PDA for `mint`. Spike only: unrestricted caller.
    #[instruction(discriminator = InitializeExtraAccountMetaListInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Execute account order: 0 source, 1 mint, 2 destination, 3 authority, 4 meta list.
        let metas = vec![
            // launch = PDA ["launch", mint]
            ExtraAccountMeta::new_with_seeds(
                &[Seed::Literal { bytes: b"launch".to_vec() }, Seed::AccountKey { index: 1 }],
                false,
                true,
            )?,
            // src_holder = PDA ["holder", source]
            ExtraAccountMeta::new_with_seeds(
                &[Seed::Literal { bytes: b"holder".to_vec() }, Seed::AccountKey { index: 0 }],
                false,
                true,
            )?,
            // dst_holder = PDA ["holder", destination]
            ExtraAccountMeta::new_with_seeds(
                &[Seed::Literal { bytes: b"holder".to_vec() }, Seed::AccountKey { index: 2 }],
                false,
                true,
            )?,
        ];

        let size = ExtraAccountMetaList::size_of(metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(size as usize);
        let mint = ctx.accounts.mint.key();
        let bump = ctx.bumps.extra_account_meta_list;
        let signer_seeds: &[&[&[u8]]] = &[&[b"extra-account-metas", mint.as_ref(), &[bump]]];
        create_account(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            lamports,
            size,
            ctx.program_id,
        )?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &metas,
        )?;
        Ok(())
    }

    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        msg!(
            "holdfast hook: {} -> {} amount={} launch={} src_holder={} dst_holder={}",
            ctx.accounts.source_token.key(),
            ctx.accounts.destination_token.key(),
            amount,
            ctx.accounts.launch.key(),
            ctx.accounts.src_holder.key(),
            ctx.accounts.dst_holder.key(),
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: created and initialised in the handler
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source authority (owner or delegate)
    pub owner: UncheckedAccount<'info>,
    /// CHECK: validated by the Token-2022 interface
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: spike only
    pub launch: UncheckedAccount<'info>,
    /// CHECK: spike only, may be uninitialised
    pub src_holder: UncheckedAccount<'info>,
    /// CHECK: spike only, may be uninitialised
    pub dst_holder: UncheckedAccount<'info>,
}
