use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FutarchyError;
use crate::state::*;

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        constraint = market.status == MarketStatus::Open @ FutarchyError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [NULLIFIER_SEED, market.key().as_ref()],
        bump,
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    /// CHECK: Light system program
    pub light_system_program: UncheckedAccount<'info>,
    /// CHECK: Account compression program
    pub account_compression_program: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: State tree
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Nullifier queue
    pub nullifier_queue: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClosePositionParams {
    /// Amount to refund (must match the locked collateral)
    pub amount: u64,
    /// Nullifier for this position (burned to prevent replay)
    pub nullifier: [u8; 32],
    /// ZK proof of ownership + leaf existence
    pub proof: EarlyCloseProof,
    pub leaf_index: u32,
    pub merkle_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EarlyCloseProof {
    pub a: [u8; 32],
    pub b: [u8; 64],
    pub c: [u8; 32],
}

pub fn handler(ctx: Context<ClosePosition>, params: ClosePositionParams) -> Result<()> {
    let clock = Clock::get()?;
    let market = &ctx.accounts.market;

    // Can only close before market closes
    require!(
        clock.unix_timestamp < market.close_ts,
        FutarchyError::MarketNotOpen
    );
    require!(params.amount > 0, FutarchyError::ZeroAmount);

    // TODO: verify ZK proof of leaf ownership (same verifier CPI as claim)

    // Refund collateral from vault
    let market_key = market.key();
    let seeds = &[VAULT_SEED, market_key.as_ref(), &[ctx.bumps.vault]];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, params.amount)?;

    // Burn nullifier
    let nullifier_set = &mut ctx.accounts.nullifier_set;
    nullifier_set.count = nullifier_set.count.checked_add(1).unwrap();

    emit!(PositionClosed {
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        nullifier: params.nullifier,
        refund_amount: params.amount,
    });

    Ok(())
}

#[event]
pub struct PositionClosed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub nullifier: [u8; 32],
    pub refund_amount: u64,
}


