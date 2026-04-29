use anchor_lang::prelude::*;
use light_sdk::{
    compressed_account::LightAccount,
    light_account, light_accounts,
    merkle_context::{PackedAddressMerkleContext, PackedMerkleContext},
    LightTraits,
};

declare_id!("PFutCHYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod private_futarchy {
    use super::*;

    /// Initialize a new prediction market
    pub fn create_market(
        ctx: Context<CreateMarket>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::create_market::handler(ctx, params)
    }

    /// Submit a private position (ZK-compressed, hidden amount + direction)
    pub fn submit_position(
        ctx: Context<SubmitPosition>,
        params: SubmitPositionParams,
    ) -> Result<()> {
        instructions::submit_position::handler(ctx, params)
    }

    /// Close a position before market resolution (optional early exit)
    pub fn close_position(
        ctx: Context<ClosePosition>,
        params: ClosePositionParams,
    ) -> Result<()> {
        instructions::close_position::handler(ctx, params)
    }

    /// Resolve the market using an oracle price feed
    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        params: ResolveMarketParams,
    ) -> Result<()> {
        instructions::resolve_market::handler(ctx, params)
    }

    /// Claim winnings after resolution — proves position privately
    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        params: ClaimWinningsParams,
    ) -> Result<()> {
        instructions::claim_winnings::handler(ctx, params)
    }
}

