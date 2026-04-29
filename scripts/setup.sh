#!/usr/bin/env bash
# scripts/setup.sh
# Run once on a fresh Debian 12 VPS to prepare the environment.
# Usage: bash scripts/setup.sh

set -euo pipefail

DEPLOY_USER="deploy"
REPO_DIR="/home/${DEPLOY_USER}/private-futarchy"

echo "═══════════════════════════════════════════"
echo "  Private Futarchy — Server Setup"
echo "═══════════════════════════════════════════"

# ── System deps ───────────────────────────────────────────────────────────────
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git build-essential pkg-config libssl-dev

# ── Node.js 20 ────────────────────────────────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

# ── Yarn ──────────────────────────────────────────────────────────────────────
echo "[3/7] Installing Yarn..."
npm install -g yarn pm2 typescript ts-node
pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER

# ── Rust + Solana CLI ─────────────────────────────────────────────────────────
echo "[4/7] Installing Rust..."
if ! command -v rustc &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
rustup component add rustfmt clippy

echo "[5/7] Installing Solana CLI..."
if ! command -v solana &>/dev/null; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi
solana --version

# ── Anchor ────────────────────────────────────────────────────────────────────
echo "[6/7] Installing Anchor CLI..."
if ! command -v anchor &>/dev/null; then
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.30.1
  avm use 0.30.1
fi
anchor --version

# ── Deploy user ───────────────────────────────────────────────────────────────
echo "[7/7] Setting up deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash $DEPLOY_USER
fi

mkdir -p $REPO_DIR
mkdir -p /home/$DEPLOY_USER/.config/solana

echo ""
echo "✅ Setup complete."
echo ""
echo "Next steps:"
echo "  1. Copy project files to $REPO_DIR"
echo "  2. Generate agent wallet:  solana-keygen new -o ~/.config/solana/agent.json"
echo "  3. Airdrop devnet SOL:     solana airdrop 2 --url devnet"
echo "  4. Copy .env:              cp agent/.env.example agent/.env && nano agent/.env"
echo "  5. Run deploy script:      bash scripts/deploy.sh"

