use anchor_lang::prelude::*;

/// Messages are shown verbatim in the UI (DESIGN.md §5.5).
#[error_code]
pub enum HoldfastError {
    #[msg("Snipe-locked: tokens bought in the opening window can't move until the lock ends")]
    SnipeLocked,
    #[msg("During the opening window tokens can only go to registered wallets")]
    RecipientNotRegistered,
    #[msg("During the opening window a wallet can't hold more than the max-wallet limit")]
    MaxWalletExceeded,
    #[msg("Launch parameter out of bounds")]
    ParamOutOfBounds,
    #[msg("Mint's transfer hook is not the Holdfast program")]
    WrongHookProgram,
    #[msg("Hook called outside of a token transfer")]
    NotTransferring,
    #[msg("Launch is not finalized yet")]
    NotFinalized,
    #[msg("Launch is already finalized")]
    AlreadyFinalized,
    #[msg("Bonding curve is not complete yet")]
    CurveNotComplete,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Account is not the DBC pool/config for this mint")]
    InvalidDbcAccount,
    #[msg("Mint authority must be revoked (fixed supply)")]
    MintAuthorityNotRevoked,
    #[msg("The bonding phase is over; registration is closed")]
    TradingClosed,
}
