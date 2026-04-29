use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::FutarchyError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            MARKET_SEED,
            authority.key().as_ref(),
            params.title.as_bytes(),
        ],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// Collateral mint (USDC, SOL-wrapped, etc.)
    pub collateral_mint: Account<'info, Mint>,

    /// Vault token account — holds all collateral for this market
    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = market,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Nullifier registry PDA
    #[account(
        init,
        payer = authority,
        space = 8 + NullifierSet::INIT_SPACE,
        seeds = [NULLIFIER_SEED, market.key().as_ref()],
        bump,
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    /// Light Protocol state tree — pre-created by the authority
    /// CHECK: Validated by Light Protocol CPI
    pub state_tree: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketParams {
    pub title: String,
    pub metric: MetricType,
    pub target_value: i64,
    pub close_ts: i64,
    pub resolve_ts: i64,
    pub oracle_feed: Pubkey,
}

pub fn handler(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        params.close_ts > clock.unix_timestamp,
        FutarchyError::MarketCloseInPast
    );
    require!(
        params.resolve_ts > params.close_ts,
        FutarchyError::InvalidMarketTimes
    );

    let market = &mut ctx.accounts.market;
    market.authority = ctx.accounts.authority.key();
    market.title = params.title;
    market.metric = params.metric;
    market.target_value = params.target_value;
    market.close_ts = params.close_ts;
    market.resolve_ts = params.resolve_ts;
    market.oracle_feed = params.oracle_feed;
    market.status = MarketStatus::Open;
    market.outcome = None;
    market.total_yes_collateral = 0;
    market.total_no_collateral = 0;
    market.position_count = 0;
    market.state_tree = ctx.accounts.state_tree.key();
    market.bump = ctx.bumps.market;

    let nullifier_set = &mut ctx.accounts.nullifier_set;
    nullifier_set.market = market.key();
    nullifier_set.bump = ctx.bumps.nullifier_set;
    nullifier_set.count = 0;

    emit!(MarketCreated {
        market: market.key(),
        authority: market.authority,
        title: market.title.clone(),
        close_ts: market.close_ts,
        resolve_ts: market.resolve_ts,
    });

    Ok(())
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub title: String,
    pub close_ts: i64,
    pub resolve_ts: i64,
}

