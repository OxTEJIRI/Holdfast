//! Token-2022 transfer hook: conviction accounting + opening-window protection rules
//! (DESIGN.md §3, §5.4).
//!
//! Safety argument: every rejection below is gated on `in_window` or on the source's `unlock_ts`,
//! and `unlock_ts` is only ever set to `now + snipe_lock_secs` while `in_window`. So after
//! `launch_ts + window_secs + snipe_lock_secs` (≤ 40 min by the hard caps) nothing here can fail,
//! and all accounting saturates instead of erroring.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions},
    state::Account as TokenAccountState,
};

use crate::constants::*;
use crate::errors::HoldfastError;
use crate::events::{HookEvent, TransferKind};
use crate::math::forfeit;
use crate::state::{Holder, Launch};

/// Execute account order is fixed by the transfer-hook interface:
/// 0 source, 1 mint, 2 destination, 3 authority, 4 extra-account-meta list, then our extras
/// (launch, src_holder, dst_holder) as declared in `init_launch`.
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Token-2022 account, read raw; must be mid-transfer (checked in handler)
    pub source_token: UncheckedAccount<'info>,
    /// CHECK: must be `launch.mint` (has_one)
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Token-2022 account, read raw
    pub destination_token: UncheckedAccount<'info>,
    /// CHECK: source owner or delegate; unused
    pub authority: UncheckedAccount<'info>,
    /// CHECK: Token-2022 resolved the extras below from this account; a direct (non-transfer)
    /// call is rejected by the `transferring` check, so its address needs no re-derivation here.
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(mut, has_one = mint)]
    pub launch: Account<'info, Launch>,
    /// CHECK: Holder PDA ["holder", source], possibly uninitialised (= unregistered)
    #[account(mut)]
    pub src_holder: UncheckedAccount<'info>,
    /// CHECK: Holder PDA ["holder", destination], possibly uninitialised (= unregistered)
    #[account(mut)]
    pub dst_holder: UncheckedAccount<'info>,
}

pub fn handle_execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
    let launch_key = ctx.accounts.launch.key();
    let mint_key = ctx.accounts.mint.key();
    let source_key = ctx.accounts.source_token.key();
    let destination_key = ctx.accounts.destination_token.key();

    // Standard transfer-hook guard: only Token-2022, mid-transfer, can get us here.
    let src_owner = {
        let info = ctx.accounts.source_token.to_account_info();
        require_keys_eq!(*info.owner, spl_token_2022::ID, HoldfastError::NotTransferring);
        let data = info.try_borrow_data()?;
        let account = StateWithExtensions::<TokenAccountState>::unpack(&data)?;
        let ext = account.get_extension::<TransferHookAccount>()?;
        require!(bool::from(ext.transferring), HoldfastError::NotTransferring);
        require_keys_eq!(account.base.mint, mint_key, HoldfastError::NotTransferring);
        account.base.owner
    };
    let (dst_owner, dst_amount) = {
        let info = ctx.accounts.destination_token.to_account_info();
        require_keys_eq!(*info.owner, spl_token_2022::ID, HoldfastError::NotTransferring);
        let data = info.try_borrow_data()?;
        (read_pubkey(&data, token_layout::OWNER), read_u64(&data, token_layout::AMOUNT))
    };

    let now = Clock::get()?.unix_timestamp;
    let launch = &mut ctx.accounts.launch;
    launch.accrue_global(now);

    if source_key == destination_key {
        return Ok(()); // self-transfer: nothing moves
    }

    let is_buy = src_owner == DBC_POOL_AUTHORITY;
    let is_sell = dst_owner == DBC_POOL_AUTHORITY;
    let in_window = launch.in_window(now);

    let mut forfeited = 0;
    if let Some(mut src) = load_holder(&ctx.accounts.src_holder, &launch_key, &source_key)? {
        forfeited = on_outgoing(launch, &mut src, amount, now)?;
        save_holder(&ctx.accounts.src_holder, &src)?;
    }

    if !is_sell {
        match load_holder(&ctx.accounts.dst_holder, &launch_key, &destination_key)? {
            Some(mut dst) => {
                on_incoming(launch, &mut dst, amount, now);
                save_holder(&ctx.accounts.dst_holder, &dst)?;
            }
            None => require!(!in_window, HoldfastError::RecipientNotRegistered),
        }
        if in_window && launch.max_wallet_bps > 0 {
            require!(dst_amount <= launch.max_wallet_amount(), HoldfastError::MaxWalletExceeded);
        }
    }

    emit!(HookEvent {
        mint: mint_key,
        kind: if is_buy {
            TransferKind::Buy
        } else if is_sell {
            TransferKind::Sell
        } else {
            TransferKind::Transfer
        },
        source: source_key,
        destination: destination_key,
        amount,
        forfeited,
        ts: now,
    });
    Ok(())
}

/// Outgoing transfer from a registered record: enforce the snipe-lock, accrue, then forfeit
/// points pro rata. Returns the points forfeited.
///
/// There is deliberately no same-owner exemption: `register` only accepts the owner's ATA, so a
/// same-owner destination is always an untracked account, and exempting it would let a holder park
/// the bag there, sell it, and keep the points (Phase 6 review; tests/security.test.ts).
pub fn on_outgoing(launch: &mut Launch, src: &mut Holder, amount: u64, now: i64) -> Result<u128> {
    if now < src.unlock_ts {
        msg!("SnipeLocked: unlocks at unix {}", src.unlock_ts);
        return err!(HoldfastError::SnipeLocked);
    }
    src.accrue(now);
    let lost = forfeit(src.points, src.tracked_balance, amount);
    src.points -= lost; // lost ≤ points by construction
    launch.total_points = launch.total_points.saturating_sub(lost);
    let moved = amount.min(src.tracked_balance);
    src.tracked_balance -= moved;
    launch.total_tracked = launch.total_tracked.saturating_sub(moved);
    Ok(lost)
}

/// Incoming transfer to a registered record: accrue, add the balance, and snipe-lock it if the
/// opening window is still running.
pub fn on_incoming(launch: &mut Launch, dst: &mut Holder, amount: u64, now: i64) {
    dst.accrue(now);
    dst.tracked_balance = dst.tracked_balance.saturating_add(amount);
    launch.total_tracked = launch.total_tracked.saturating_add(amount);
    if launch.in_window(now) {
        dst.unlock_ts = dst.unlock_ts.max(now.saturating_add(launch.snipe_lock_secs as i64));
    }
}

fn load_holder(info: &AccountInfo, launch: &Pubkey, token_account: &Pubkey) -> Result<Option<Holder>> {
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(None);
    }
    let data = info.try_borrow_data()?;
    let holder = Holder::try_deserialize(&mut &data[..])?;
    require_keys_eq!(holder.launch, *launch, ErrorCode::ConstraintHasOne);
    require_keys_eq!(holder.token_account, *token_account, ErrorCode::ConstraintSeeds);
    Ok(Some(holder))
}

fn save_holder(info: &AccountInfo, holder: &Holder) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut data;
    holder.try_serialize(&mut writer)
}

pub fn read_pubkey(data: &[u8], offset: usize) -> Pubkey {
    Pubkey::new_from_array(data[offset..offset + 32].try_into().unwrap())
}

pub fn read_u64(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(window: u32, lock: u32) -> Launch {
        Launch {
            launch_ts: 1_000,
            window_secs: window,
            snipe_lock_secs: lock,
            total_supply: 1_000_000,
            global_last_ts: 1_000,
            ..Default::default()
        }
    }

    fn holder(ts: i64) -> Holder {
        Holder { last_ts: ts, ..Default::default() }
    }

    #[test]
    fn buy_in_window_locks_then_unlocks() {
        let mut l = launch(60, 300);
        let mut h = holder(1_000);
        l.accrue_global(1_010);
        on_incoming(&mut l, &mut h, 100, 1_010);
        assert_eq!(h.unlock_ts, 1_310);
        assert!(on_outgoing(&mut l, &mut h, 10, 1_309).is_err());
        assert!(on_outgoing(&mut l, &mut h, 10, 1_310).is_ok());
    }

    #[test]
    fn buy_after_window_is_not_locked() {
        let mut l = launch(60, 300);
        let mut h = holder(1_000);
        on_incoming(&mut l, &mut h, 100, 1_060);
        assert_eq!(h.unlock_ts, 0);
        assert!(on_outgoing(&mut l, &mut h, 100, 1_060).is_ok());
    }

    #[test]
    fn partial_and_full_sell_forfeit_proportionally() {
        let mut l = launch(0, 0);
        let mut h = holder(1_000);
        l.accrue_global(1_000);
        on_incoming(&mut l, &mut h, 400, 1_000);
        l.accrue_global(1_010);
        let lost = on_outgoing(&mut l, &mut h, 100, 1_010).unwrap();
        assert_eq!((lost, h.points, h.tracked_balance), (1_000, 3_000, 300));
        assert_eq!((l.total_points, l.total_tracked), (3_000, 300));
        l.accrue_global(1_020);
        on_outgoing(&mut l, &mut h, 300, 1_020).unwrap();
        assert_eq!((h.points, h.tracked_balance, l.total_points, l.total_tracked), (0, 0, 0, 0));
    }

    #[test]
    fn every_move_out_forfeits_points_with_the_tokens() {
        // whatever the destination (another owner, or an untracked account of the same owner),
        // points never stay behind without the tokens that earned them
        let mut l = launch(0, 0);
        let mut h = holder(1_000);
        on_incoming(&mut l, &mut h, 400, 1_000);
        let lost = on_outgoing(&mut l, &mut h, 400, 1_010).unwrap();
        assert_eq!((lost, h.points, h.tracked_balance), (4_000, 0, 0));
        assert_eq!((l.total_points, l.total_tracked), (0, 0));
    }

    #[test]
    fn untracked_excess_never_underflows() {
        // record tracks 50 but the wallet sends 80 (it held tokens before registering)
        let mut l = launch(0, 0);
        let mut h = holder(1_000);
        on_incoming(&mut l, &mut h, 50, 1_000);
        on_outgoing(&mut l, &mut h, 80, 1_005).unwrap();
        assert_eq!((h.points, h.tracked_balance, l.total_tracked), (0, 0, 0));
    }

    #[test]
    fn global_total_equals_sum_of_holders() {
        let mut l = launch(30, 60);
        let (mut a, mut b) = (holder(1_000), holder(1_000));
        let steps: &[(i64, bool, bool, u64)] = &[
            // (ts, holder a?, incoming?, amount)
            (1_005, true, true, 500),
            (1_012, false, true, 250),
            (1_100, true, false, 100),
            (1_150, false, true, 40),
            (1_400, false, false, 290),
            (1_401, true, false, 1),
        ];
        for &(ts, is_a, incoming, amount) in steps {
            l.accrue_global(ts);
            let h = if is_a { &mut a } else { &mut b };
            if incoming {
                on_incoming(&mut l, h, amount, ts);
            } else {
                on_outgoing(&mut l, h, amount, ts).unwrap();
            }
        }
        l.accrue_global(2_000);
        a.accrue(2_000);
        b.accrue(2_000);
        assert_eq!(l.total_tracked, a.tracked_balance + b.tracked_balance);
        assert_eq!(l.total_points, a.points + b.points);
    }

    #[test]
    fn nothing_rejects_after_window_plus_lock() {
        let mut l = launch(600, 1_800);
        let mut h = holder(1_000);
        on_incoming(&mut l, &mut h, 1_000, 1_599); // last second of the window
        assert_eq!(h.unlock_ts, 1_599 + 1_800);
        assert!(on_outgoing(&mut l, &mut h, 1, 1_000 + 600 + 1_800).is_ok());
    }
}
