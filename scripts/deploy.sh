#!/usr/bin/env bash
# scripts/deploy.sh
# Build everything and start/restart the agent under PM2.
# Usage: bash scripts/deploy.sh [devnet|mainnet]

set -euo pipefail

NETWORK=${1:-devnet}
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════"
echo "  Private Futarchy — Deploy ($NETWORK)"
echo "═══════════════════════════════════════════"

cd "$REPO_DIR"

# ── Validate .env exists ──────────────────────────────────────────────────────
if [ ! -f "agent/.env" ]; then
  echo "❌ agent/.env not found. Copy from agent/.env.example and fill in values."
  exit 1
fi

# Check for API key
if ! grep -q "ANTHROPIC_API_KEY=sk-ant" agent/.env; then
  echo "❌ ANTHROPIC_API_KEY not set in agent/.env"
  exit 1
fi

# ── Install deps ──────────────────────────────────────────────────────────────
echo "[1/5] Installing dependencies..."
yarn install --frozen-lockfile

# ── Build SDK ─────────────────────────────────────────────────────────────────
echo "[2/5] Building SDK..."
yarn build:sdk

# ── Build Anchor program ──────────────────────────────────────────────────────
echo "[3/5] Building Anchor program..."
anchor build

# ── Build agent ───────────────────────────────────────────────────────────────
echo "[4/5] Building agent..."
yarn build:agent

# ── Build frontend ────────────────────────────────────────────────────────────
echo "[4b/5] Building frontend..."
yarn build:app

# ── Start / restart PM2 ───────────────────────────────────────────────────────
echo "[5/5] Starting PM2..."
if pm2 list | grep -q "futarchy-agent"; then
  pm2 reload ecosystem.config.js --env "$NETWORK" --update-env
  echo "♻️  Agent reloaded"
else
  pm2 start ecosystem.config.js --env "$NETWORK"
  echo "🚀 Agent started"
fi

pm2 save

echo ""
echo "✅ Deployed on $NETWORK"
echo ""
echo "Monitor:"
echo "  pm2 logs futarchy-agent --lines 50"
echo "  pm2 monit"
echo ""
echo "Stop:   pm2 stop futarchy-agent"
echo "Delete: pm2 delete futarchy-agent"

