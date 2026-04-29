use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use light_sdk::{
    compressed_account::LightAccount,
    light_account, light_accounts,
    merkle_context::{PackedAddressMerkleContext, PackedMerkleContext},
    LightTraits,
};

use crate::errors::FutarchyError;
use crate::state::*;

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SubmitPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Open @ FutarchyError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    /// Owner's collateral token account (debit from here)
    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// Market vault (credit here)
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    // ── Light Protocol accounts ──────────────────────────────────────────────

    /// CHECK: Light system program
    pub light_system_program: UncheckedAccount<'info>,

    /// CHECK: Account compression program
    pub account_compression_program: UncheckedAccount<'info>,

    /// CHECK: State tree for this market's positions
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: Queue for batched Merkle updates
    #[account(mut)]
    pub nullifier_queue: UncheckedAccount<'info>,

    /// CHECK: Registered program account (Light)
    pub registered_program_pda: UncheckedAccount<'info>,

    /// CHECK: Noop program for logging
    pub noop_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── Params ──────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SubmitPositionParams {
    /// Pedersen commitment: Commit(direction || amount || nonce)
    /// direction: 0 = NO, 1 = YES
    /// Generated client-side; program never sees plaintext direction or amount
    pub commitment: [u8; 32],

    /// Nullifier = hash(owner_secret || leaf_index)
    /// Used to prevent double-claim. Revealed at claim time.
    pub nullifier: [u8; 32],

    /// AES-256-GCM encrypted (amount as u64 LE bytes)
    /// Encrypted to owner's ephemeral key; owner decrypts at claim time
    pub encrypted_amount: [u8; 48],

    /// Actual collateral to lock in vault
    /// NOTE: This IS revealed to prevent over/under-collateralization.
    /// The *direction* (YES/NO) remains hidden.
    /// For full amount privacy, use range proofs (post-MVP).
    pub collateral_amount: u64,

    /// Light Protocol proof inputs
    pub proof: CompressedProof,
    pub merkle_context: PackedMerkleContext,
    pub address_merkle_context: PackedAddressMerkleContext,
    pub address_merkle_tree_root_index: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CompressedProof {
    pub a: [u8; 32],
    pub b: [u8; 64],
    pub c: [u8; 32],
}

// ─── Handler ─────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<SubmitPosition>, params: SubmitPositionParams) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    // Check market is still open
    require!(
        clock.unix_timestamp < market.close_ts,
        FutarchyError::MarketNotOpen
    );
    require!(
        params.collateral_amount > 0,
        FutarchyError::ZeroAmount
    );

    // ── 1. Lock collateral in vault ──────────────────────────────────────────
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.owner_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, params.collateral_amount)?;

    // ── 2. Build compressed position leaf ───────────────────────────────────
    //
    // The leaf stores the commitment + nullifier + encrypted_amount.
    // The plaintext direction and amount are NOT stored on-chain.
    // The leaf is appended to the market's Light Protocol state tree.
    //
    let leaf_data = PositionLeaf {
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        commitment: params.commitment,
        nullifier: params.nullifier,
        encrypted_amount: params.encrypted_amount,
        created_slot: clock.slot,
    };

    // ── 3. CPI into Light Protocol to append leaf ────────────────────────────
    //
    // In production: call light_system_program::compress_account with leaf_data.
    // The proof validates that:
    //   (a) the nullifier is fresh (not in nullifier set)
    //   (b) the commitment is well-formed
    //   (c) the owner signed the transaction
    //
    // For now we serialize the leaf and emit it — full CPI wired in next pass.
    emit!(PositionSubmitted {
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        commitment: params.commitment,
        nullifier: params.nullifier,
        collateral_amount: params.collateral_amount,
        slot: clock.slot,
    });

    // ── 4. Update market aggregate state ────────────────────────────────────
    //
    // We track total collateral (public) but NOT per-direction totals yet.
    // At resolve time, a ZK aggregate proof reveals the YES/NO split
    // without exposing individual positions.
    //
    // For MVP: track combined collateral only. Direction split revealed by
    // the settlement proof, not individual positions.
    //
    market.position_count = market.position_count.checked_add(1).unwrap();

    Ok(())
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct PositionSubmitted {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub commitment: [u8; 32],
    pub nullifier: [u8; 32],
    /// Amount IS public (collateral lock). Direction is hidden.
    pub collateral_amount: u64,
    pub slot: u64,
}

