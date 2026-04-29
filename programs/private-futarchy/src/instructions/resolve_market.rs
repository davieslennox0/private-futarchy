use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

use crate::errors::FutarchyError;
use crate::state::*;

// Staleness threshold: reject oracle prices older than 60 seconds
const MAX_ORACLE_AGE_SECS: u64 = 60;

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    /// Anyone can call resolve once resolve_ts has passed
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = market.status != MarketStatus::Resolved @ FutarchyError::MarketAlreadyResolved,
        constraint = market.status != MarketStatus::Cancelled @ FutarchyError::MarketCancelled,
    )]
    pub market: Account<'info, Market>,

    /// Pyth price feed account
    /// CHECK: Validated via market.oracle_feed comparison
    pub price_update: Account<'info, PriceUpdateV2>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ResolveMarketParams {
    /// The hex-encoded Pyth price feed ID for this market's metric
    /// e.g. "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" for BTC/USD
    pub feed_id_hex: String,
}

pub fn handler(ctx: Context<ResolveMarket>, params: ResolveMarketParams) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    require!(
        clock.unix_timestamp >= market.resolve_ts,
        FutarchyError::MarketNotResolvable
    );

    // Validate oracle feed matches market config
    require!(
        ctx.accounts.price_update.key() == market.oracle_feed,
        FutarchyError::OracleMismatch
    );

    // Fetch price from Pyth V2
    let feed_id = get_feed_id_from_hex(&params.feed_id_hex)
        .map_err(|_| error!(FutarchyError::OracleMismatch))?;

    let price_data = ctx.accounts.price_update
        .get_price_no_older_than(&clock, MAX_ORACLE_AGE_SECS, &feed_id)
        .map_err(|_| error!(FutarchyError::StaleOracle))?;

    // price_data.price is i64 with exponent price_data.exponent
    // Normalize to match market.target_value scale
    let normalized_price = normalize_price(price_data.price, price_data.exponent);

    let outcome = if normalized_price >= market.target_value {
        MarketOutcome::Yes
    } else {
        MarketOutcome::No
    };

    market.status = MarketStatus::Resolved;
    market.outcome = Some(outcome.clone());

    emit!(MarketResolved {
        market: market.key(),
        outcome: outcome,
        oracle_price: normalized_price,
        target_value: market.target_value,
        resolved_at: clock.unix_timestamp,
    });

    Ok(())
}

/// Normalize a Pyth price (i64 with negative exponent) to a plain i64
/// For MVP: assumes target_value is in the same units as the raw Pyth price
fn normalize_price(price: i64, exponent: i32) -> i64 {
    if exponent >= 0 {
        price.saturating_mul(10_i64.saturating_pow(exponent as u32))
    } else {
        // e.g. price=5000000000, exponent=-8 → 50 (in dollars)
        price / 10_i64.saturating_pow((-exponent) as u32)
    }
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub outcome: MarketOutcome,
    pub oracle_price: i64,
    pub target_value: i64,
    pub resolved_at: i64,
}

