import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  solana: {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    keypairPath: process.env.AGENT_KEYPAIR_PATH || '~/.config/solana/agent.json',
    programId: process.env.PROGRAM_ID!,
    collateralMint: process.env.COLLATERAL_MINT!,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-20250514',
  },
  pyth: {
    priceServiceUrl: process.env.PYTH_PRICE_SERVICE_URL || 'https://hermes.pyth.network',
    feeds: {
      SOL_USD: process.env.PYTH_SOL_USD_FEED!,
      BTC_USD: process.env.PYTH_BTC_USD_FEED!,
    },
  },
  agent: {
    observeIntervalMs: parseInt(process.env.OBSERVE_INTERVAL_MS || '300000'),
    cycleLabel: process.env.CYCLE_LABEL || 'private-futarchy-agent',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
} as const;

export function validateConfig() {
  const required = [
    ['ANTHROPIC_API_KEY', config.anthropic.apiKey],
    ['PROGRAM_ID', config.solana.programId],
    ['COLLATERAL_MINT', config.solana.collateralMint],
  ];
  for (const [name, val] of required) {
    if (!val) throw new Error(`Missing required env var: ${name}`);
  }
}

