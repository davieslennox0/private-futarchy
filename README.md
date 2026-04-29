# Private Futarchy Module

> Solana Frontier Hackathon 2026 — ZK-private prediction markets using Light Protocol

## What it is

A governance primitive that lets DAOs and protocols run futarchy markets where:
- **Vote direction (YES/NO) is hidden** — no whale intimidation, no front-running
- **Collateral is locked on-chain** — no fake positions, sybil-resistant
- **Outcomes are verifiable** — Pyth oracle resolution, ZK-proven payouts
- **Claims are private** — winners prove ownership without revealing their position

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client (Browser/CLI)              │
│                                                     │
│  1. Generate nonce                                  │
│  2. Compute commitment = Pedersen(dir, amt, nonce)  │
│  3. Encrypt amount with ephemeral key               │
│  4. Submit tx → program + Light Protocol            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│             private_futarchy program                │
│                                                     │
│  submit_position:                                   │
│    • Lock collateral in vault (SPL token)           │
│    • Append leaf to Light state tree                │
│      leaf = { commitment, nullifier, enc_amount }   │
│    • Increment position_count                       │
│                                                     │
│  resolve_market:                                    │
│    • Fetch Pyth price                               │
│    • Compare to target_value                        │
│    • Set outcome = Yes | No                         │
│                                                     │
│  claim_winnings:                                    │
│    • Verify Groth16 proof:                          │
│      - commitment preimage correct                  │
│      - leaf in Merkle tree (inclusion proof)        │
│      - nullifier fresh                              │
│    • Nullify leaf                                   │
│    • Transfer payout from vault                     │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           Light Protocol (ZK Compression)           │
│                                                     │
│  • State trees: compressed position leaves          │
│  • Nullifier queues: prevent double-spend           │
│  • Forester nodes: batch Merkle updates             │
│  • Photon RPC: query compressed accounts            │
└─────────────────────────────────────────────────────┘
```

## Privacy Model

| Data | Visibility |
|------|-----------|
| Position exists | Public (leaf in tree) |
| Collateral amount (MVP) | Public (vault delta) |
| Vote direction (YES/NO) | **Private** |
| Winning claim | Public (nullifier revealed) |
| Payout amount | Public (transfer event) |

**Post-MVP:** Use range proofs to hide collateral amount too. Upgrade path: replace `collateral_amount` in `SubmitPositionParams` with a Pedersen commitment + range proof.

## What's a Futarchy Market?

A policy is proposed (e.g. "Should we raise protocol fees?"). Two parallel markets open:
- Market A: price of governance token IF policy passes
- Market B: price of governance token IF policy does NOT pass

After resolution, whichever market predicts a higher token price wins — that policy is enacted. Participants profit by voting correctly. The mechanism surfaces truthful predictions because money is on the line.

**With privacy:** whales can't see which side has momentum to coordinate suppression. Small voters can't be intimidated. Signal quality improves.

## Project Structure

```
private-futarchy/
├── programs/
│   └── private-futarchy/
│       └── src/
│           ├── lib.rs                  # Program entrypoint
│           ├── state.rs                # Market, PositionLeaf, NullifierSet
│           ├── errors.rs               # FutarchyError codes
│           └── instructions/
│               ├── create_market.rs    # Initialize a market
│               ├── submit_position.rs  # Private position submission
│               ├── close_position.rs   # Early exit (pre-resolution)
│               ├── resolve_market.rs   # Oracle-based resolution
│               └── claim_winnings.rs   # ZK-proven claim
├── circuits/                           # (next) Groth16 circuits
│   └── position_claim/
├── sdk/                                # (next) TypeScript client SDK
│   └── src/
├── app/                                # (next) React frontend
│   └── src/
├── tests/
│   └── private-futarchy.ts
└── Anchor.toml
```

## Build & Test

```bash
# Install deps
yarn install

# Build program
anchor build

# Run tests (localnet with Light Protocol cloned)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Dependencies

- **Anchor 0.30.1** — Solana program framework
- **Light Protocol 0.9.0** — ZK Compression (state trees, nullifiers)
- **Pyth Solana Receiver SDK 0.4.0** — Oracle price feeds
- **anchor-spl** — SPL token CPI

## Roadmap

- [x] Market creation + collateral vault
- [x] Private position submission (commitment scheme)
- [x] Pyth oracle resolution
- [x] ZK-proven claim (proof stub — verifier CPI next)
- [ ] Groth16 circuit for commitment + inclusion proof
- [ ] Full Light Protocol CPI wiring (compress_account)
- [ ] On-chain nullifier Merkle accumulator
- [ ] TypeScript SDK (commitment generation, proof building)
- [ ] React frontend
- [ ] Pro-rata payout distribution (replace 2x MVP model)
- [ ] Amount privacy via range proofs

## Hackathon Submission

**Track:** Grand Champion / Public Goods  
**Hackathon:** Solana Frontier 2026 (Colosseum)  
**Deadline:** May 11, 2026

