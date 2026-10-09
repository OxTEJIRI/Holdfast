use anchor_lang::prelude::*;

pub const LAUNCH_SEED: &[u8] = b"launch";
pub const HOLDER_SEED: &[u8] = b"holder";
pub const REWARDS_SEED: &[u8] = b"rewards";
pub const REWARDS_VAULT_SEED: &[u8] = b"rewards_vault";
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// Hard caps (DESIGN.md §3.2). Together they bound the "can't reject any transfer after" time to
/// launch_ts + 600 + 1800 seconds = 40 minutes.
pub const MAX_WINDOW_SECS: u32 = 600;
pub const MAX_SNIPE_LOCK_SECS: u32 = 1800;
pub const MIN_MAX_WALLET_BPS: u16 = 50;
pub const BPS_DENOMINATOR: u16 = 10_000;

/// Meteora Dynamic Bonding Curve.
pub const DBC_PROGRAM_ID: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
/// PDA ["pool_authority"] under DBC: owns the pool vaults (verified in Phase 0, docs/VERIFICATION.md V9).
pub const DBC_POOL_AUTHORITY: Pubkey = pubkey!("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM");

/// DBC account layouts (zero-copy, offsets include the 8-byte discriminator).
pub mod dbc_layout {
    /// sha256("account:TransferHookPool")[..8]
    pub const TRANSFER_HOOK_POOL_DISC: [u8; 8] = [237, 219, 184, 23, 42, 189, 169, 35];
    /// sha256("account:ConfigWithTransferHook")[..8]
    pub const CONFIG_WITH_TRANSFER_HOOK_DISC: [u8; 8] = [40, 220, 194, 251, 41, 199, 123, 253];

    // PoolState: VolatilityTracker (64) then config, creator, base_mint, ...
    pub const POOL_CONFIG: usize = 72;
    pub const POOL_CREATOR: usize = 104;
    pub const POOL_BASE_MINT: usize = 136;
    /// u64 LE (VERIFICATION.md V5)
    pub const POOL_FINISH_CURVE_TIMESTAMP: usize = 344;
    pub const POOL_LEN: usize = 8 + 416;

    // ConfigWithTransferHook { config: PoolConfig { quote_mint, fee_claimer, .. } (1040), transfer_hook_program }
    pub const CONFIG_QUOTE_MINT: usize = 8;
    pub const CONFIG_FEE_CLAIMER: usize = 40;
    pub const CONFIG_TRANSFER_HOOK_PROGRAM: usize = 8 + 1040;
    pub const CONFIG_LEN: usize = 8 + 1120;
}

/// SPL token account layout (base state, identical for Token and Token-2022).
pub mod token_layout {
    pub const OWNER: usize = 32;
    pub const AMOUNT: usize = 64;
}

/// Meteora Dynamic Fee Sharing.
pub mod dfs {
    use anchor_lang::prelude::*;
    pub const PROGRAM_ID: Pubkey = pubkey!("dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh");
    /// PDA ["fee_vault_authority"]
    pub const FEE_VAULT_AUTHORITY: Pubkey = pubkey!("EYqHRdtepv1KKUkPAYMBYpSfiGfNd8sa55ZtswodTfBS");
    /// PDA ["__event_authority"]
    pub const EVENT_AUTHORITY: Pubkey = pubkey!("EjRrm5Ptzzbp4fft5k4oC9LvbXqVA4UV4Sc9RNULDhCA");
    /// sha256("global:claim_fee")[..8]
    pub const CLAIM_FEE_DISC: [u8; 8] = [169, 32, 79, 137, 136, 232, 70, 137];
}
