use anchor_lang::prelude::*;

#[error_code]
pub enum FutarchyError {
    #[msg("Market is not open for new positions")]
    MarketNotOpen,

    #[msg("Market has not reached resolution time")]
    MarketNotResolvable,

    #[msg("Market is already resolved")]
    MarketAlreadyResolved,

    #[msg("Market close time must be before resolve time")]
    InvalidMarketTimes,

    #[msg("Market close time is in the past")]
    MarketCloseInPast,

    #[msg("Position amount must be greater than zero")]
    ZeroAmount,

    #[msg("ZK proof verification failed")]
    InvalidProof,

    #[msg("Nullifier has already been used — double claim detected")]
    NullifierAlreadyUsed,

    #[msg("Commitment does not match revealed values")]
    CommitmentMismatch,

    #[msg("Oracle feed does not match market configuration")]
    OracleMismatch,

    #[msg("Oracle price is stale")]
    StaleOracle,

    #[msg("Insufficient collateral in vault")]
    InsufficientVault,

    #[msg("Position does not belong to this market")]
    MarketMismatch,

    #[msg("Caller is not the position owner")]
    Unauthorized,

    #[msg("Market is cancelled — use refund instead")]
    MarketCancelled,
}

