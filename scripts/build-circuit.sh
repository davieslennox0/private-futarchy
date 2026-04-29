#!/usr/bin/env bash
# scripts/build-circuit.sh
# Compiles the Circom circuit, runs Powers of Tau ceremony,
# generates proving/verification keys, and exports the Solana verifier.
#
# Prerequisites:
#   npm install -g circom snarkjs
#   (circom binary must be in PATH)
#
# Usage: bash scripts/build-circuit.sh

set -euo pipefail

CIRCUIT_DIR="circuits/position_claim"
BUILD_DIR="$CIRCUIT_DIR/build"
CIRCUIT="$CIRCUIT_DIR/circuit.circom"
PTAU_FILE="pot20_final.ptau"

mkdir -p "$BUILD_DIR"

echo "═══════════════════════════════════════════"
echo "  Build ZK Circuit — PositionClaim"
echo "═══════════════════════════════════════════"

# ── 1. Compile circuit ────────────────────────────────────────────────────────
echo "[1/6] Compiling circuit..."
circom "$CIRCUIT" \
  --r1cs "$BUILD_DIR/circuit.r1cs" \
  --wasm "$BUILD_DIR" \
  --sym  "$BUILD_DIR/circuit.sym" \
  --c    \
  -l node_modules \
  -o "$BUILD_DIR"

echo "  Constraints:"
snarkjs r1cs info "$BUILD_DIR/circuit.r1cs"

# ── 2. Powers of Tau (download Hermez ceremony if not present) ────────────────
echo "[2/6] Fetching Powers of Tau (pot20)..."
if [ ! -f "$PTAU_FILE" ]; then
  curl -L "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_20.ptau" \
    -o "$PTAU_FILE"
fi

# ── 3. Phase 2 setup ──────────────────────────────────────────────────────────
echo "[3/6] Running Phase 2 setup..."
snarkjs groth16 setup "$BUILD_DIR/circuit.r1cs" "$PTAU_FILE" "$BUILD_DIR/circuit_0000.zkey"

# Contribute entropy (in production: use a real multi-party ceremony)
echo "futarchy-hackathon-entropy-$(date +%s)" | \
  snarkjs zkey contribute "$BUILD_DIR/circuit_0000.zkey" "$BUILD_DIR/circuit_final.zkey" \
  --name="Private Futarchy Hackathon" -v

# Export verification key
snarkjs zkey export verificationkey "$BUILD_DIR/circuit_final.zkey" "$BUILD_DIR/verification_key.json"

# ── 4. Test proof generation ──────────────────────────────────────────────────
echo "[4/6] Generating test proof..."
# Create dummy input (for compile test only)
cat > "$BUILD_DIR/input.json" << 'EOF'
{
  "nullifier": "1234567890",
  "merkleRoot": "9876543210",
  "leafIndex": "0",
  "commitment": "1111111111",
  "direction": "1",
  "amount": "1000000",
  "nonce": "2222222222",
  "ownerSecret": "3333333333",
  "merklePath": ["0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
  "pathIndices": ["0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"]
}
EOF

node "$BUILD_DIR/circuit_js/generate_witness.js" \
  "$BUILD_DIR/circuit_js/circuit.wasm" \
  "$BUILD_DIR/input.json" \
  "$BUILD_DIR/witness.wtns"

snarkjs groth16 prove \
  "$BUILD_DIR/circuit_final.zkey" \
  "$BUILD_DIR/witness.wtns" \
  "$BUILD_DIR/proof.json" \
  "$BUILD_DIR/public.json"

# ── 5. Verify proof ───────────────────────────────────────────────────────────
echo "[5/6] Verifying test proof..."
snarkjs groth16 verify \
  "$BUILD_DIR/verification_key.json" \
  "$BUILD_DIR/public.json" \
  "$BUILD_DIR/proof.json"

# ── 6. Export Solana-compatible calldata ──────────────────────────────────────
echo "[6/6] Exporting calldata..."
snarkjs zkey export solidityverifier \
  "$BUILD_DIR/circuit_final.zkey" \
  "$BUILD_DIR/verifier.sol"

echo ""
echo "✅ Circuit built successfully"
echo ""
echo "Output files:"
echo "  $BUILD_DIR/circuit_final.zkey  — proving key"
echo "  $BUILD_DIR/verification_key.json — verification key"
echo "  $BUILD_DIR/circuit_js/         — WASM prover"
echo ""
echo "Next: integrate $BUILD_DIR/circuit_js into sdk/src/proof.ts"

