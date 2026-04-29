import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Groth16Proof {
  a: Uint8Array;   // G1 point, 32 bytes
  b: Uint8Array;   // G2 point, 64 bytes
  c: Uint8Array;   // G1 point, 32 bytes
}

export interface PositionClaimPublicInputs {
  nullifier:    Uint8Array;   // 32 bytes — public nullifier
  merkleRoot:   Uint8Array;   // 32 bytes — state tree root
  leafIndex:    number;
  owner:        PublicKey;
  commitment:   Uint8Array;   // 32 bytes — the position commitment
}

export interface PositionClaimWitness {
  direction:    0 | 1;        // 0 = NO, 1 = YES (private)
  amount:       bigint;       // (private)
  nonce:        Uint8Array;   // 32 bytes (private)
  ownerSecret:  Uint8Array;   // 32 bytes derived from wallet (private)
  merklePath:   Uint8Array[]; // siblings on path to root (private)
  pathIndices:  number[];     // left/right at each level (private)
}

// ─── Proof builder ────────────────────────────────────────────────────────────
//
// Production path:
//   1. Compile circuits/position_claim/circuit.circom with circom 2.x
//   2. Run trusted setup: snarkjs groth16 setup
//   3. Generate witness: snarkjs wtns calculate
//   4. Generate proof:   snarkjs groth16 prove
//   5. Export calldata:  snarkjs zkey export solidityverifier
//      (or use Light's on-chain Groth16 verifier program directly)
//
// For hackathon MVP: stub proof passes the on-chain stub verifier.
// Replace buildProof() internals once the circuit is compiled.
//

export async function buildPositionClaimProof(
  inputs: PositionClaimPublicInputs,
  witness: PositionClaimWitness
): Promise<Groth16Proof> {
  // ── Validate witness matches public inputs ──────────────────────────────
  verifyWitnessConsistency(inputs, witness);

  // ── Production: call snarkjs WASM prover ───────────────────────────────
  //
  // const { proof } = await snarkjs.groth16.fullProve(
  //   {
  //     direction:   witness.direction,
  //     amount:      witness.amount.toString(),
  //     nonce:       Array.from(witness.nonce),
  //     ownerSecret: Array.from(witness.ownerSecret),
  //     merklePath:  witness.merklePath.map(p => Array.from(p)),
  //     pathIndices: witness.pathIndices,
  //   },
  //   'circuits/position_claim/circuit_js/circuit.wasm',
  //   'circuits/position_claim/circuit_final.zkey'
  // );
  //
  // return {
  //   a: hexToBytes(proof.pi_a[0]),
  //   b: new Uint8Array([...hexToBytes(proof.pi_b[0][0]), ...hexToBytes(proof.pi_b[0][1])]),
  //   c: hexToBytes(proof.pi_c[0]),
  // };

  // ── MVP stub ────────────────────────────────────────────────────────────
  // Deterministic but not cryptographically valid.
  // The on-chain verifier stub accepts this unconditionally.
  const seed = createHash('sha256')
    .update(Buffer.from(inputs.nullifier))
    .update(Buffer.from(inputs.merkleRoot))
    .update(inputs.owner.toBuffer())
    .digest();

  return {
    a: new Uint8Array(seed),
    b: new Uint8Array([...seed, ...seed]),
    c: new Uint8Array(createHash('sha256').update(seed).digest()),
  };
}

// ─── Merkle inclusion proof builder ──────────────────────────────────────────
//
// Builds the sibling path from the compressed state tree.
// In production: fetch from Photon RPC (Light Protocol indexer).
//

export async function buildMerkleProof(
  stateTreePubkey: PublicKey,
  leafIndex: number,
  photonRpcUrl: string
): Promise<{ root: Uint8Array; path: Uint8Array[]; indices: number[] }> {
  // Production:
  // const response = await fetch(`${photonRpcUrl}`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     jsonrpc: '2.0',
  //     id: 1,
  //     method: 'getCompressedAccountProof',
  //     params: [{ tree: stateTreePubkey.toBase58(), leafIndex }],
  //   }),
  // });
  // const { result } = await response.json();
  // return {
  //   root: hexToBytes(result.root),
  //   path: result.proof.map(hexToBytes),
  //   indices: result.leafIndices,
  // };

  // MVP stub — 20-level tree, all zero siblings
  const TREE_DEPTH = 20;
  return {
    root: new Uint8Array(32),
    path: Array.from({ length: TREE_DEPTH }, () => new Uint8Array(32)),
    indices: Array.from({ length: TREE_DEPTH }, (_, i) => (leafIndex >> i) & 1),
  };
}

// ─── Verification (client-side sanity check before submitting) ────────────────

function verifyWitnessConsistency(
  inputs: PositionClaimPublicInputs,
  witness: PositionClaimWitness
): void {
  const { createHash } = require('crypto');

  // Recompute commitment from witness
  const dirByte = Buffer.from([witness.direction]);
  const amtBytes = Buffer.alloc(8);
  amtBytes.writeBigUInt64LE(witness.amount);
  const preimage = Buffer.concat([dirByte, amtBytes, Buffer.from(witness.nonce)]);
  const recomputed = new Uint8Array(createHash('sha256').update(preimage).digest());

  if (!bytesEqual(recomputed, inputs.commitment)) {
    throw new Error('Witness commitment mismatch — check direction, amount, nonce');
  }

  // Recompute nullifier from witness
  const indexBytes = Buffer.alloc(4);
  indexBytes.writeUInt32LE(inputs.leafIndex);
  const nullPreimage = Buffer.concat([Buffer.from(witness.ownerSecret), indexBytes]);
  const recomputedNullifier = new Uint8Array(createHash('sha256').update(nullPreimage).digest());

  if (!bytesEqual(recomputedNullifier, inputs.nullifier)) {
    throw new Error('Witness nullifier mismatch — check ownerSecret and leafIndex');
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

