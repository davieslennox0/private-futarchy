use anchor_lang::prelude::*;

// ─── Market (public, on-chain) ───────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Authority that created this market (can resolve)
    pub authority: Pubkey,

    /// Short human-readable label, e.g. "Should protocol raise fees?"
    #[max_len(64)]
    pub title: String,

    /// The metric being predicted (e.g. TVL, revenue, token price)
    pub metric: MetricType,

    /// Target value — market resolves YES if metric >= target at expiry
    pub target_value: i64,

    /// Unix timestamp when the market closes to new positions
    pub close_ts: i64,

    /// Unix timestamp when the market resolves
    pub resolve_ts: i64,

    /// Oracle feed pubkey used for resolution (Pyth/Switchboard price account)
    pub oracle_feed: Pubkey,

    /// Current market state
    pub status: MarketStatus,

    /// Resolved outcome (set after resolution)
    pub outcome: Option<MarketOutcome>,

    /// Aggregate YES collateral (sum of all YES positions, revealed at resolve)
    pub total_yes_collateral: u64,

    /// Aggregate NO collateral
    pub total_no_collateral: u64,

    /// Number of positions submitted
    pub position_count: u64,

    /// Light Protocol state tree used for this market's compressed positions
    pub state_tree: Pubkey,

    /// Bump for PDA
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MetricType {
    TokenPrice,
    ProtocolTVL,
    ProtocolRevenue,
    CustomU64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,       // Accepting positions
    Closed,     // No new positions, awaiting resolution
    Resolved,   // Outcome set, claims open
    Cancelled,  // Refunds available
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MarketOutcome {
    Yes,
    No,
}

// ─── Position (compressed, private) ─────────────────────────────────────────
//
// This struct is stored as a Light Protocol compressed account leaf.
// It is NOT a regular Solana account — it lives in the Merkle state tree.
// The `position_hash` commits to (owner, direction, amount, nonce) so that:
//   - On-chain: only the hash is visible in the tree leaf
//   - Off-chain: the user retains the preimage for claim proofs
//

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PositionLeaf {
    /// Market this position belongs to
    pub market: Pubkey,

    /// Owner of the position (can claim)
    pub owner: Pubkey,

    /// Pedersen commitment to (direction || amount || nonce)
    /// Hidden from public view — only owner can open it
    pub commitment: [u8; 32],

    /// Nullifier hash to prevent double-claim
    /// = hash(owner_secret || leaf_index)
    pub nullifier: [u8; 32],

    /// Collateral deposited (revealed only at claim time via ZK proof)
    /// Stored encrypted; the proof reveals it to the program without
    /// publishing it to the ledger
    pub encrypted_amount: [u8; 48], // AES-GCM encrypted u64 + tag

    /// Slot this position was created
    pub created_slot: u64,
}

// ─── Nullifier Registry (public, on-chain) ───────────────────────────────────
//
// Prevents double-claiming. Nullifier is revealed at claim time;
// if it's already in this set, the claim is rejected.
//

#[account]
#[derive(InitSpace)]
pub struct NullifierSet {
    pub market: Pubkey,
    pub bump: u8,
    // Actual nullifier storage uses a Merkle accumulator
    // For MVP: simple bitmap over a 10,000-position space
    pub count: u64,
}

// ─── Seeds ───────────────────────────────────────────────────────────────────

pub const MARKET_SEED: &[u8] = b"market";
pub const NULLIFIER_SEED: &[u8] = b"nullifier";
pub const VAULT_SEED: &[u8] = b"vault";

