#!/usr/bin/env bash
# scripts/deploy-program.sh
# Build and deploy the Anchor program to devnet.
# Run this once when the program address is finalized.

set -euo pipefail

NETWORK=${1:-devnet}
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════"
echo "  Deploy Anchor Program → $NETWORK"
echo "═══════════════════════════════════════════"

cd "$REPO_DIR"

# ── Build ─────────────────────────────────────────────────────────────────────
echo "[1/3] Building program..."
anchor build

# Show program ID
echo ""
echo "Program keypair: target/deploy/private_futarchy-keypair.json"
echo "Program ID:"
solana-keygen pubkey target/deploy/private_futarchy-keypair.json

# ── Airdrop if devnet and balance low ─────────────────────────────────────────
if [ "$NETWORK" = "devnet" ]; then
  BALANCE=$(solana balance --url devnet | awk '{print $1}')
  echo ""
  echo "Deployer balance: $BALANCE SOL"
  if (( $(echo "$BALANCE < 5" | bc -l) )); then
    echo "Airdropping SOL for deployment..."
    solana airdrop 5 --url devnet || true
    sleep 2
  fi
fi

# ── Deploy ────────────────────────────────────────────────────────────────────
echo ""
echo "[2/3] Deploying to $NETWORK..."
anchor deploy --provider.cluster "$NETWORK"

# ── Update program ID in configs ──────────────────────────────────────────────
echo ""
echo "[3/3] Done. Update PROGRAM_ID in:"
echo "  Anchor.toml"
echo "  agent/.env"
echo "  app/src/hooks/useFutarchy.ts"
echo ""
echo "Then run: bash scripts/deploy.sh $NETWORK"

