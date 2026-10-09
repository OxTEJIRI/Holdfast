//! Holdfast: a plug-in conviction layer for Meteora DBC launches (see DESIGN.md).

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod constants;
pub mod errors;
pub mod events;
pub mod hook;
pub mod instructions;
pub mod math;
pub mod state;

use hook::*;
use instructions::*;

declare_id!("E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw");

#[program]
pub mod holdfast {
    use super::*;

    pub fn init_launch(ctx: Context<InitLaunch>, params: LaunchParams) -> Result<()> {
        instructions::init_launch::handle_init_launch(ctx, params)
    }

    pub fn register(ctx: Context<Register>) -> Result<()> {
        instructions::register::handle_register(ctx)
    }

    /// Token-2022 transfer-hook `Execute` (SPL discriminator).
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        hook::handle_execute(ctx, amount)
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        instructions::finalize::handle_finalize(ctx)
    }
}
