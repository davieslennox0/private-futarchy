import { Connection, Keypair } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config, validateConfig } from './config';
import { logger } from './logger';
import { Observer } from './observe';
import { Brain } from './brain';
import { Actor } from './act';
import { Reflector } from './reflect';
import { Telegram } from './telegram';
import { Watchdog } from './watchdog';

if (!fs.existsSync('logs')) fs.mkdirSync('logs');

async function loadWallet(): Promise<Keypair> {
  const keypairPath = config.solana.keypairPath.replace('~', os.homedir());
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Wallet not found at ${keypairPath}. Run: solana-keygen new -o ${keypairPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function runCycle(
  observer: Observer,
  brain: Brain,
  actor: Actor,
  reflector: Reflector,
  telegram: Telegram,
  watchdog: Watchdog,
  state: ReturnType<Reflector['loadState']>
) {
  const cycleStart = Date.now();
  logger.info(`\n${'─'.repeat(60)}`);
  logger.info(`🔄 CYCLE #${state.cycleCount + 1} | ${new Date().toISOString()}`);
  logger.info('─'.repeat(60));

  try {
    // ── OBSERVE ──────────────────────────────────────────────────────────────
    const { metrics, deltas, activeMarkets } = await observer.observe(state);

    const anomalies = deltas.filter((d) => d.isAnomaly);
    if (anomalies.length > 0) {
      await telegram.anomalyDetected(
        anomalies.map((a) => `${a.metric}: ${a.changePct > 0 ? '+' : ''}${a.changePct.toFixed(2)}%`)
      );
    }

    // ── DECIDE ───────────────────────────────────────────────────────────────
    const decision = await brain.decide(metrics, deltas, activeMarkets, state);

    // ── ACT ──────────────────────────────────────────────────────────────────
    const actResults = await actor.act(decision);

    if (actResults.proposed && decision.proposal) {
      await telegram.marketProposed(
        decision.proposal.title,
        actResults.proposed,
        decision.proposal.rationale
      );
    }
    for (const action of actResults.executed) {
      await telegram.policyExecuted(action);
    }

    // ── REFLECT ──────────────────────────────────────────────────────────────
    const reflection = reflector.reflect(state, metrics, deltas, decision, actResults);
    const updatedState = reflector.updateState(state, metrics, decision, actResults, reflection);
    reflector.saveState(updatedState);

    // Ping watchdog — state written, cycle healthy
    watchdog.ping(updatedState.cycleCount);

    const elapsed = Date.now() - cycleStart;
    logger.info(`✓ Cycle complete in ${elapsed}ms. Next: ${config.agent.observeIntervalMs / 1000}s`);

    return updatedState;
  } catch (err) {
    logger.error('Cycle failed', { err });
    return state;
  }
}

async function main() {
  logger.info('🦜 Private Futarchy Agent starting...');

  validateConfig();

  const connection = new Connection(config.solana.rpcUrl, 'confirmed');
  const wallet = await loadWallet();
  logger.info('🔑 Wallet loaded', { pubkey: wallet.publicKey.toBase58() });

  const balance = await connection.getBalance(wallet.publicKey);
  logger.info('💰 SOL balance', { sol: (balance / 1e9).toFixed(4) });
  if (balance < 0.05 * 1e9) {
    logger.warn('⚠️  Low SOL balance — may not be able to submit transactions');
  }

  const observer  = new Observer(connection);
  const brain     = new Brain();
  const actor     = new Actor(connection, wallet);
  const reflector = new Reflector();
  const telegram  = new Telegram();
  const watchdog  = new Watchdog();

  let state = reflector.loadState();

  watchdog.start();

  await telegram.send(
    `🦜 *Private Futarchy Agent Online*\n` +
    `Cycle: #${state.cycleCount}\n` +
    `Wallet: \`${wallet.publicKey.toBase58().slice(0, 16)}...\`\n` +
    `Network: ${config.solana.rpcUrl.includes('devnet') ? 'Devnet' : 'Mainnet'}`
  );

  logger.info('🚀 Running. Interval:', { ms: config.agent.observeIntervalMs });

  // First cycle immediately
  state = await runCycle(observer, brain, actor, reflector, telegram, watchdog, state);

  setInterval(async () => {
    state = await runCycle(observer, brain, actor, reflector, telegram, watchdog, state);
  }, config.agent.observeIntervalMs);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down gracefully');
    watchdog.stop();
    reflector.saveState(state);
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received — shutting down gracefully');
    watchdog.stop();
    reflector.saveState(state);
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Fatal error', { err });
  process.exit(1);
});

