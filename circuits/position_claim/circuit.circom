pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/sha256/sha256.circom";

// ─── MerkleProof ─────────────────────────────────────────────────────────────
// Verifies that a leaf exists in a Merkle tree of depth `levels`.

template MerkleProof(levels) {
    signal input  leaf;
    signal input  pathElements[levels];
    signal input  pathIndices[levels];
    signal output root;

    component hashers[levels];
    signal      nodes[levels + 1];
    nodes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);

        // pathIndices[i] == 0 → node is left child
        // pathIndices[i] == 1 → node is right child
        hashers[i].inputs[0] <== (1 - pathIndices[i]) * nodes[i]         + pathIndices[i] * pathElements[i];
        hashers[i].inputs[1] <== (1 - pathIndices[i]) * pathElements[i]  + pathIndices[i] * nodes[i];

        nodes[i + 1] <== hashers[i].out;
    }

    root <== nodes[levels];
}

// ─── CommitmentHasher ─────────────────────────────────────────────────────────
// Computes Poseidon(direction, amount, nonce) — the position commitment.

template CommitmentHasher() {
    signal input  direction;    // 0 or 1
    signal input  amount;       // u64 as field element
    signal input  nonce;        // 32-byte nonce as field element

    signal output commitment;

    component h = Poseidon(3);
    h.inputs[0] <== direction;
    h.inputs[1] <== amount;
    h.inputs[2] <== nonce;

    commitment <== h.out;
}

// ─── NullifierHasher ──────────────────────────────────────────────────────────
// Computes Poseidon(ownerSecret, leafIndex) — the position nullifier.

template NullifierHasher() {
    signal input  ownerSecret;  // derived from wallet key
    signal input  leafIndex;    // position index in tree

    signal output nullifier;

    component h = Poseidon(2);
    h.inputs[0] <== ownerSecret;
    h.inputs[1] <== leafIndex;

    nullifier <== h.out;
}

// ─── PositionClaim (main circuit) ────────────────────────────────────────────
//
// Public inputs:  nullifier, merkleRoot, leafIndex, commitment
// Private inputs: direction, amount, nonce, ownerSecret, merklePath, pathIndices
//
// Proves:
//   1. commitment == Poseidon(direction, amount, nonce)
//   2. nullifier  == Poseidon(ownerSecret, leafIndex)
//   3. leaf       == Poseidon(commitment, nullifier)
//      exists in the Merkle tree at merkleRoot
//

template PositionClaim(levels) {
    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input nullifier;
    signal input merkleRoot;
    signal input leafIndex;
    signal input commitment;

    // ── Private inputs ────────────────────────────────────────────────────────
    signal input direction;         // 0 = NO, 1 = YES
    signal input amount;            // collateral amount
    signal input nonce;             // commitment nonce
    signal input ownerSecret;       // derived from wallet keypair
    signal input merklePath[levels];
    signal input pathIndices[levels];

    // ── 1. Verify commitment ──────────────────────────────────────────────────
    component commHasher = CommitmentHasher();
    commHasher.direction <== direction;
    commHasher.amount    <== amount;
    commHasher.nonce     <== nonce;
    commHasher.commitment === commitment;

    // ── 2. Verify nullifier ───────────────────────────────────────────────────
    component nullHasher = NullifierHasher();
    nullHasher.ownerSecret <== ownerSecret;
    nullHasher.leafIndex   <== leafIndex;
    nullHasher.nullifier === nullifier;

    // ── 3. Compute leaf hash ──────────────────────────────────────────────────
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== commitment;
    leafHasher.inputs[1] <== nullifier;

    // ── 4. Verify Merkle inclusion ────────────────────────────────────────────
    component merkle = MerkleProof(levels);
    merkle.leaf <== leafHasher.out;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== merklePath[i];
        merkle.pathIndices[i]  <== pathIndices[i];
    }
    merkle.root === merkleRoot;

    // ── 5. Direction is binary ────────────────────────────────────────────────
    direction * (1 - direction) === 0;
}

// Tree depth = 20 supports up to 2^20 = 1,048,576 positions per market
component main {public [nullifier, merkleRoot, leafIndex, commitment]} = PositionClaim(20);
