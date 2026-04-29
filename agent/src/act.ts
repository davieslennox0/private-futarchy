import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { config } from './config';
import { logger } from './logger';
import { BrainDecision, MarketProposal } from './types';

// Seeds — must match program constants
const MARKET_SEED = Buffer.from('market');
const VAULT_SEED = Buffer.from('vault');
const NULLIFIER_SEED = Buffer.from('nullifier');

export class Actor {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = new PublicKey(config.solana.programId);
  }

  // ── Main act entry point ───────────────────────────────────────────────────

  async act(decision: BrainDecision): Promise<{
    proposed: string | null;
    resolved: string[];
    executed: string[];
  }> {
    logger.info('⚡ Acting on decision...');

    const results = {
      proposed: null as string | null,
      resolved: [] as string[],
      executed: [] as string[],
    };

    // 1. Propose new market if brain says to
    if (decision.shouldPropose && decision.proposal?.shouldCreate) {
      try {
        const marketPk = await this.createMarket(decision.proposal);
        results.proposed = marketPk;
        logger.info('✅ Market proposed', { market: marketPk, title: decision.proposal.title });
      } catch (err) {
        logger.error('❌ Market proposal failed', { err });
      }
    }

    // 2. Resolve expired markets
    for (const marketPk of decision.shouldResolve) {
      try {
        await this.resolveMarket(marketPk);
        results.resolved.push(marketPk);
        logger.info('✅ Market resolved', { market: marketPk });
      } catch (err) {
        logger.error('❌ Market resolution failed', { market: marketPk, err });
      }
    }

    // 3. Execute policy for YES-resolved markets
    for (const marketPk of decision.shouldExecute) {
      try {
        const action = await this.executePolicyAction(marketPk);
        results.executed.push(action);
        logger.info('✅ Policy executed', { market: marketPk, action });
      } catch (err) {
        logger.error('❌ Policy execution failed', { market: marketPk, err });
      }
    }

    return results;
  }

  // ── Create Market ──────────────────────────────────────────────────────────

  private async createMarket(proposal: MarketProposal): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const closeTs = now + proposal.closeInHours * 3600;
    const resolveTs = now + proposal.resolveInHours * 3600;

    // Derive market PDA
    const [marketPda] = PublicKey.findProgramAddressSync(
      [MARKET_SEED, this.wallet.publicKey.toBuffer(), Buffer.from(proposal.title)],
      this.programId
    );

    // Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPda.toBuffer()],
      this.programId
    );

    // Derive nullifier PDA
    const [nullifierPda] = PublicKey.findProgramAddressSync(
      [NULLIFIER_SEED, marketPda.toBuffer()],
      this.programId
    );

    // Find oracle feed pubkey from feed ID
    // For Pyth V2: oracle_feed = the PriceUpdateV2 account, not the feed ID
    // In production: pre-fetch the price account for the feed and pass it here
    const oracleFeedPk = new PublicKey(
      // Placeholder — real implementation fetches the Pyth price account
      // corresponding to proposal.oracleFeedId from the Pyth price service
      config.solana.programId
    );

    const metricTypeMap: Record<string, number> = {
      TokenPrice: 0,
      ProtocolTVL: 1,
      ProtocolRevenue: 2,
      CustomU64: 3,
    };

    // Build instruction data manually (matches Anchor IDL encoding)
    // In production: use the generated IDL types from `anchor build`
    const params = {
      title: proposal.title,
      metric: { [proposal.metricType.toLowerCase()]: {} },
      targetValue: new anchor.BN(proposal.targetValue),
      closeTs: new anchor.BN(closeTs),
      resolveTs: new anchor.BN(resolveTs),
      oracleFeed: oracleFeedPk,
    };

    logger.info('📝 Creating market on-chain', {
      pda: marketPda.toBase58(),
      title: proposal.title,
      closeTs: new Date(closeTs * 1000).toISOString(),
      resolveTs: new Date(resolveTs * 1000).toISOString(),
    });

    // ── CPI simulation (swap for real Anchor program client post-IDL build) ──
    // After `anchor build`, import the IDL and use:
    //   const program = new anchor.Program(IDL, this.programId, provider);
    //   await program.methods.createMarket(params).accounts({...}).rpc();

    // For now: log the would-be transaction details
    logger.info('🔧 [Stub] createMarket CPI ready — wire after anchor build', { params });

    return marketPda.toBase58();
  }

  // ── Resolve Market ─────────────────────────────────────────────────────────

  private async resolveMarket(marketPk: string): Promise<void> {
    logger.info('🔮 Resolving market', { market: marketPk });

    // After anchor build:
    //   await program.methods.resolveMarket({ feedIdHex: feedId })
    //     .accounts({ market: new PublicKey(marketPk), priceUpdate: oracleFeedPk })
    //     .rpc();

    logger.info('🔧 [Stub] resolveMarket CPI ready — wire after anchor build');
  }

  // ── Execute Policy ─────────────────────────────────────────────────────────
  //
  // This is what makes futarchy powerful: after YES resolution, the agent
  // autonomously executes the proposed policy via CPI to the target protocol.
  //
  // Examples:
  //   - Update fee parameter on a DEX
  //   - Adjust yield split on a lending protocol
  //   - Trigger a rebalance on a vault
  //
  // For the hackathon: emit a governance action event describing what would happen
  //

  private async executePolicyAction(marketPk: string): Promise<string> {
    logger.info('🏛️  Executing policy action for resolved YES market', { market: marketPk });

    // In production: fetch market account, read the encoded policy action,
    // execute CPI to target protocol.

    // For MVP: log the governance action
    const action = `Policy enacted for market ${marketPk.slice(0, 8)}... — onchain action queued`;
    logger.info('📜 Governance action', { action });

    return action;
  }
}


