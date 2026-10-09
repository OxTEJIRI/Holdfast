use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::token_2022::spl_token_2022::{
    extension::{transfer_hook::TransferHook, BaseStateWithExtensions, StateWithExtensions},
    state::Mint as MintState,
};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount, TokenInterface};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::events::LaunchCreated;
use crate::hook::read_pubkey;
use crate::state::Launch;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct LaunchParams {
    pub window_secs: u32,
    pub snipe_lock_secs: u32,
    /// 0 = off, otherwise ≥ 50 bps
    pub max_wallet_bps: u16,
    /// DFS fee vault (must be the DBC config's fee claimer), or `Pubkey::default()` for keeper mode.
    pub fee_vault: Pubkey,
}

impl LaunchParams {
    pub fn validate(&self) -> Result<()> {
        require!(self.window_secs <= MAX_WINDOW_SECS, HoldfastError::ParamOutOfBounds);
        require!(self.snipe_lock_secs <= MAX_SNIPE_LOCK_SECS, HoldfastError::ParamOutOfBounds);
        require!(
            self.max_wallet_bps == 0
                || (MIN_MAX_WALLET_BPS..=BPS_DENOMINATOR).contains(&self.max_wallet_bps),
            HoldfastError::ParamOutOfBounds
        );
        Ok(())
    }
}

/// Must run in the same transaction as DBC pool creation, right after it: the mint is created in
/// that tx, and `creator` must be the pool creator, so nobody can front-run this.
#[derive(Accounts)]
pub struct InitLaunch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub creator: Signer<'info>,
    #[account(mint::token_program = token_2022_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: DBC TransferHookPool for `mint`, validated in handler
    pub dbc_pool: UncheckedAccount<'info>,
    /// CHECK: DBC ConfigWithTransferHook of `dbc_pool`, validated in handler
    pub dbc_config: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Launch::INIT_SPACE,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump,
    )]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: created and initialised in the handler
    #[account(mut, seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: PDA that owns the rewards vault and is the DFS shareholder
    #[account(seeds = [REWARDS_SEED, mint.key().as_ref()], bump)]
    pub rewards_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        seeds = [REWARDS_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = rewards_authority,
        token::token_program = quote_token_program,
    )]
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mint::token_program = quote_token_program)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_launch(ctx: Context<InitLaunch>, params: LaunchParams) -> Result<()> {
    params.validate()?;
    let mint_key = ctx.accounts.mint.key();

    // The mint must hook into us and have a fixed supply.
    {
        let info = ctx.accounts.mint.to_account_info();
        let data = info.try_borrow_data()?;
        let mint = StateWithExtensions::<MintState>::unpack(&data)?;
        let hook = mint
            .get_extension::<TransferHook>()
            .map_err(|_| error!(HoldfastError::WrongHookProgram))?;
        require!(
            Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
            HoldfastError::WrongHookProgram
        );
    }
    require!(ctx.accounts.mint.mint_authority.is_none(), HoldfastError::MintAuthorityNotRevoked);

    // The DBC pool/config are the real ones for this mint, and `creator` created the pool.
    {
        let pool = ctx.accounts.dbc_pool.to_account_info();
        require_keys_eq!(*pool.owner, DBC_PROGRAM_ID, HoldfastError::InvalidDbcAccount);
        let data = pool.try_borrow_data()?;
        require!(
            data.len() >= dbc_layout::POOL_LEN && data[..8] == dbc_layout::TRANSFER_HOOK_POOL_DISC,
            HoldfastError::InvalidDbcAccount
        );
        require_keys_eq!(read_pubkey(&data, dbc_layout::POOL_BASE_MINT), mint_key, HoldfastError::InvalidDbcAccount);
        require_keys_eq!(read_pubkey(&data, dbc_layout::POOL_CONFIG), ctx.accounts.dbc_config.key(), HoldfastError::InvalidDbcAccount);
        require_keys_eq!(read_pubkey(&data, dbc_layout::POOL_CREATOR), ctx.accounts.creator.key(), HoldfastError::InvalidDbcAccount);

        let config = ctx.accounts.dbc_config.to_account_info();
        require_keys_eq!(*config.owner, DBC_PROGRAM_ID, HoldfastError::InvalidDbcAccount);
        let data = config.try_borrow_data()?;
        require!(
            data.len() >= dbc_layout::CONFIG_LEN && data[..8] == dbc_layout::CONFIG_WITH_TRANSFER_HOOK_DISC,
            HoldfastError::InvalidDbcAccount
        );
        require_keys_eq!(read_pubkey(&data, dbc_layout::CONFIG_QUOTE_MINT), ctx.accounts.quote_mint.key(), HoldfastError::InvalidDbcAccount);
        if params.fee_vault != Pubkey::default() {
            require_keys_eq!(read_pubkey(&data, dbc_layout::CONFIG_FEE_CLAIMER), params.fee_vault, HoldfastError::InvalidDbcAccount);
        }
    }

    // ExtraAccountMetaList: extras are seeded by account *keys* only (DESIGN.md §5.3).
    // Execute order: 0 source, 1 mint, 2 destination, 3 authority, 4 meta list, 5 launch, ...
    let metas = [
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: LAUNCH_SEED.to_vec() }, Seed::AccountKey { index: 1 }],
            false,
            true,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: HOLDER_SEED.to_vec() }, Seed::AccountKey { index: 0 }],
            false,
            true,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: HOLDER_SEED.to_vec() }, Seed::AccountKey { index: 2 }],
            false,
            true,
        )?,
    ];
    let size = ExtraAccountMetaList::size_of(metas.len())?;
    let bump = ctx.bumps.extra_account_meta_list;
    let signer_seeds: &[&[&[u8]]] = &[&[EXTRA_ACCOUNT_METAS_SEED, mint_key.as_ref(), &[bump]]];
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        Rent::get()?.minimum_balance(size),
        size as u64,
        &crate::ID,
    )?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
        &metas,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let launch = &mut ctx.accounts.launch;
    launch.set_inner(Launch {
        mint: mint_key,
        dbc_pool: ctx.accounts.dbc_pool.key(),
        dbc_config: ctx.accounts.dbc_config.key(),
        creator: ctx.accounts.creator.key(),
        fee_vault: params.fee_vault,
        launch_ts: now,
        window_secs: params.window_secs,
        snipe_lock_secs: params.snipe_lock_secs,
        max_wallet_bps: params.max_wallet_bps,
        total_supply: ctx.accounts.mint.supply,
        global_last_ts: now,
        bump: ctx.bumps.launch,
        ..Default::default()
    });

    emit!(LaunchCreated {
        launch: launch.key(),
        mint: mint_key,
        dbc_pool: launch.dbc_pool,
        creator: launch.creator,
        fee_vault: launch.fee_vault,
        launch_ts: now,
        window_secs: launch.window_secs,
        snipe_lock_secs: launch.snipe_lock_secs,
        max_wallet_bps: launch.max_wallet_bps,
    });
    Ok(())
}
