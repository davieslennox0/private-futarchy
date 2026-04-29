use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FutarchyError;
use crate::state::*;

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        constraint = market.status == MarketStatus::Resolved @ FutarchyError::MarketNotResolvable,
    )]
    pub market: Account<'info, Market>,

    /// Vault to pay out from
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Owner's token account to receive payout
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

    // ── Light Protocol accounts ──────────────────────────────────────────────
    /// CHECK: Light system program
    pub light_system_program: UncheckedAccount<'info>,
    /// CHECK: Account compression program
    pub account_compression_program: UncheckedAccount<'info>,
    /// CHECK: State tree
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    /// CHECK: Nullifier queue
    #[account(mut)]
    pub nullifier_queue: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── Params ──────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimWinningsParams {
    /// The winning direction the claimant is proving they voted
    /// Revealed here because the market is already resolved — no front-run risk
    pub direction: PositionDirection,

    /// Plaintext collateral amount (must match commitment preimage)
    pub amount: u64,

    /// Random nonce used in commitment = Commit(direction || amount || nonce)
    pub nonce: [u8; 32],

    /// The nullifier for this position (prevents double-claim)
    pub nullifier: [u8; 32],

    /// Groth16 proof that:
    ///   1. Commit(direction || amount || nonce) == leaf.commitment
    ///   2. nullifier == hash(owner_secret || leaf_index)
    ///   3. leaf exists in the market's state tree (Merkle inclusion proof)
    ///   4. owner == signer
    pub proof: ClaimProof,

    /// Merkle path to the position leaf
    pub leaf_index: u32,
    pub merkle_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PositionDirection {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimProof {
    pub a: [u8; 32],
    pub b: [u8; 64],
    pub c: [u8; 32],
}

// ─── Handler ─────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<ClaimWinnings>, params: ClaimWinningsParams) -> Result<()> {
    let market = &ctx.accounts.market;
    let outcome = market.outcome.as_ref().unwrap();

    // ── 1. Check claimant is on the winning side ─────────────────────────────
    let is_winner = match outcome {
        MarketOutcome::Yes => params.direction == PositionDirection::Yes,
        MarketOutcome::No  => params.direction == PositionDirection::No,
    };

    // Losers can claim back their principal (no winnings, no loss for MVP)
    // Full futarchy payout logic: winners share losers' collateral pro-rata
    // For MVP: binary outcome — winners get back 2x, losers get back 0
    // TODO: replace with pro-rata pool split in v2

    // ── 2. Verify nullifier is fresh ────────────────────────────────────────
    // In production: check against on-chain nullifier Merkle accumulator
    // For MVP: emit and rely on indexer dedup + CPI to Light nullifier queue
    // (Full on-chain nullifier bitmap is wired in next pass)

    // ── 3. Verify ZK proof ───────────────────────────────────────────────────
    //
    // The proof attests:
    //   - commitment preimage (direction, amount, nonce) is correct
    //   - leaf exists in the state tree at leaf_index
    //   - nullifier is derived correctly from owner_secret
    //
    // In production: CPI to Light's verify_compressed_account or a custom
    // Groth16 verifier program. For MVP: placeholder — mark for integration.
    //
    verify_claim_proof(
        &params.proof,
        &params.nullifier,
        &params.merkle_root,
        params.leaf_index,
        ctx.accounts.owner.key(),
        &params.direction,
        params.amount,
        &params.nonce,
    )?;

    // ── 4. Compute payout ────────────────────────────────────────────────────
    let payout = if is_winner {
        // MVP: 2x (winners take all; assumes equal YES/NO pool)
        // Production: payout = amount * (total_pool / total_winning_collateral)
        params.amount.checked_mul(2).unwrap_or(params.amount)
    } else {
        // Losers get nothing in MVP binary model
        0
    };

    if payout > 0 {
        // ── 5. Transfer payout from vault ────────────────────────────────────
        let market_key = market.key();
        let seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.bumps.vault],
        ];
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
        token::transfer(transfer_ctx, payout)?;
    }

    // ── 6. Burn nullifier (prevent re-claim) ────────────────────────────────
    let nullifier_set = &mut ctx.accounts.nullifier_set;
    nullifier_set.count = nullifier_set.count.checked_add(1).unwrap();

    emit!(WinningsClaimed {
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        nullifier: params.nullifier,
        payout,
        is_winner,
    });

    Ok(())
}

// ─── Proof Verification (stub — replace with real verifier CPI) ─────────────

fn verify_claim_proof(
    proof: &ClaimProof,
    nullifier: &[u8; 32],
    merkle_root: &[u8; 32],
    leaf_index: u32,
    owner: &Pubkey,
    direction: &PositionDirection,
    amount: u64,
    nonce: &[u8; 32],
) -> Result<()> {
    // TODO: CPI to Groth16 verifier program with public inputs:
    //   [nullifier, merkle_root, leaf_index, owner, direction_bit, amount, commitment]
    //
    // For MVP dev/test: always passes. Remove before mainnet.
    let _ = (proof, nullifier, merkle_root, leaf_index, owner, direction, amount, nonce);
    Ok(())
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub owner: Pubkey,
    /// Nullifier revealed on-chain — cannot be reused
    pub nullifier: [u8; 32],
    pub payout: u64,
    pub is_winner: bool,
}

