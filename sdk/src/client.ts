import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import {
  createRpc,
  Rpc,
  LightSystemProgram,
  bn,
  defaultTestStateTreeAccounts,
} from '@lightprotocol/stateless.js';
import { createPosition, decryptAmount, deriveEncryptionKey, Direction } from './commitment';

// ─── Seeds (must match program) ───────────────────────────────────────────────
const MARKET_SEED = Buffer.from('market');
const VAULT_SEED = Buffer.from('vault');
const NULLIFIER_SEED = Buffer.from('nullifier');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateMarketArgs {
  title: string;
  metricType: 'TokenPrice' | 'ProtocolTVL' | 'ProtocolRevenue' | 'CustomU64';
  targetValue: number;
  closeInHours: number;
  resolveInHours: number;
  oracleFeedPubkey: PublicKey;
}

export interface SubmitPositionArgs {
  marketPubkey: PublicKey;
  direction: Direction;
  collateralAmount: bigint; // token base units
}

export interface ClaimArgs {
  marketPubkey: PublicKey;
  direction: Direction;
  amount: bigint;
  nonce: Uint8Array;
  nullifier: Uint8Array;
  leafIndex: number;
  merkleRoot: Uint8Array;
}

export interface MarketAccount {
  publicKey: PublicKey;
  authority: PublicKey;
  title: string;
  targetValue: anchor.BN;
  closeTs: anchor.BN;
  resolveTs: anchor.BN;
  status: string;
  outcome: string | null;
  positionCount: anchor.BN;
  totalYesCollateral: anchor.BN;
  totalNoCollateral: anchor.BN;
}

// ─── FutarchyClient ───────────────────────────────────────────────────────────

export class FutarchyClient {
  private connection: Connection;
  private rpc: Rpc;
  private programId: PublicKey;
  private collateralMint: PublicKey;
  // Program instance — initialized after IDL is available
  private program: anchor.Program | null = null;

  constructor(
    rpcUrl: string,
    programId: string,
    collateralMint: string
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.rpc = createRpc(rpcUrl, rpcUrl);
    this.programId = new PublicKey(programId);
    this.collateralMint = new PublicKey(collateralMint);
  }

  // ── PDAs ──────────────────────────────────────────────────────────────────

  getMarketPda(authority: PublicKey, title: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [MARKET_SEED, authority.toBuffer(), Buffer.from(title)],
      this.programId
    );
  }

  getVaultPda(marketPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketPubkey.toBuffer()],
      this.programId
    );
  }

  getNullifierPda(marketPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [NULLIFIER_SEED, marketPubkey.toBuffer()],
      this.programId
    );
  }

  // ── Create market ─────────────────────────────────────────────────────────

  async createMarket(
    wallet: Keypair,
    args: CreateMarketArgs
  ): Promise<{ txid: string; marketPubkey: PublicKey }> {
    const now = Math.floor(Date.now() / 1000);
    const closeTs = now + args.closeInHours * 3600;
    const resolveTs = now + args.resolveInHours * 3600;

    const [marketPda] = this.getMarketPda(wallet.publicKey, args.title);
    const [vaultPda] = this.getVaultPda(marketPda);
    const [nullifierPda] = this.getNullifierPda(marketPda);

    // Fetch default Light state tree accounts
    const stateTreeAccounts = defaultTestStateTreeAccounts();

    // Build instruction via program client (requires IDL post-anchor-build)
    // Placeholder: returns market PDA and logs
    console.log('createMarket:', {
      market: marketPda.toBase58(),
      vault: vaultPda.toBase58(),
      title: args.title,
      closeTs: new Date(closeTs * 1000).toISOString(),
      resolveTs: new Date(resolveTs * 1000).toISOString(),
    });

    return { txid: 'pending-idl', marketPubkey: marketPda };
  }

  // ── Submit position ───────────────────────────────────────────────────────

  async submitPosition(
    wallet: Keypair,
    args: SubmitPositionArgs
  ): Promise<{
    txid: string;
    commitment: Uint8Array;
    nullifier: Uint8Array;
    leafIndex: number;
  }> {
    // Fetch current leaf count from market account to get leaf index
    const leafIndex = await this.getNextLeafIndex(args.marketPubkey);

    // Generate cryptographic position bundle
    const positionBundle = createPosition(
      args.direction,
      args.collateralAmount,
      wallet.secretKey,
      leafIndex
    );

    const [vaultPda] = this.getVaultPda(args.marketPubkey);
    const ownerAta = await getAssociatedTokenAddress(
      this.collateralMint,
      wallet.publicKey
    );

    // Fetch Light Protocol compressed account tree info
    const treeAccounts = defaultTestStateTreeAccounts();

    console.log('submitPosition:', {
      market: args.marketPubkey.toBase58(),
      direction: '[ PRIVATE ]',  // Never log direction
      collateral: args.collateralAmount.toString(),
      commitment: Buffer.from(positionBundle.commitment).toString('hex').slice(0, 16) + '...',
      leafIndex,
    });

    // Build and send tx (wired after IDL available)
    // program.methods.submitPosition({
    //   commitment: positionBundle.commitment,
    //   nullifier: positionBundle.nullifier,
    //   encryptedAmount: positionBundle.encryptedAmount,
    //   collateralAmount: new anchor.BN(args.collateralAmount.toString()),
    //   proof: stubProof(),
    //   merkleContext: treeAccounts.merkleContext,
    //   addressMerkleContext: treeAccounts.addressMerkleContext,
    //   addressMerkleTreeRootIndex: 0,
    // }).accounts({ ... }).rpc()

    // Store position secret locally (user MUST back this up)
    this.storePositionSecret(wallet.publicKey, args.marketPubkey, leafIndex, positionBundle);

    return {
      txid: 'pending-idl',
      commitment: positionBundle.commitment,
      nullifier: positionBundle.nullifier,
      leafIndex,
    };
  }

  // ── Claim winnings ────────────────────────────────────────────────────────

  async claimWinnings(
    wallet: Keypair,
    args: ClaimArgs
  ): Promise<{ txid: string; payout: bigint }> {
    const [vaultPda] = this.getVaultPda(args.marketPubkey);
    const [nullifierPda] = this.getNullifierPda(args.marketPubkey);
    const ownerAta = await getAssociatedTokenAddress(
      this.collateralMint,
      wallet.publicKey
    );

    // Build stub proof (replace with real Groth16 proof from circuit)
    const stubProof = {
      a: new Uint8Array(32),
      b: new Uint8Array(64),
      c: new Uint8Array(32),
    };

    console.log('claimWinnings:', {
      market: args.marketPubkey.toBase58(),
      direction: args.direction,
      amount: args.amount.toString(),
      leafIndex: args.leafIndex,
    });

    // program.methods.claimWinnings({ ... }).accounts({ ... }).rpc()

    return { txid: 'pending-idl', payout: 0n };
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  async getMarket(marketPubkey: PublicKey): Promise<MarketAccount | null> {
    try {
      const info = await this.connection.getAccountInfo(marketPubkey);
      if (!info) return null;
      // Deserialize via program IDL after anchor build
      // return this.program!.account.market.fetch(marketPubkey);
      return null;
    } catch {
      return null;
    }
  }

  async getAllMarkets(): Promise<MarketAccount[]> {
    // return this.program!.account.market.all();
    return [];
  }

  // ── Leaf index ────────────────────────────────────────────────────────────

  private async getNextLeafIndex(marketPubkey: PublicKey): Promise<number> {
    const market = await this.getMarket(marketPubkey);
    return market ? market.positionCount.toNumber() : 0;
  }

  // ── Local secret storage ──────────────────────────────────────────────────
  // In production: encrypted local storage / keychain. For MVP: JSON file.

  private storePositionSecret(
    owner: PublicKey,
    market: PublicKey,
    leafIndex: number,
    bundle: ReturnType<typeof createPosition>
  ) {
    const key = `${owner.toBase58()}_${market.toBase58()}_${leafIndex}`;
    const record = {
      owner: owner.toBase58(),
      market: market.toBase58(),
      leafIndex,
      direction: bundle.secret.direction,
      amount: bundle.secret.amount.toString(),
      nonce: Buffer.from(bundle.secret.nonce).toString('hex'),
      commitment: Buffer.from(bundle.commitment).toString('hex'),
      nullifier: Buffer.from(bundle.nullifier).toString('hex'),
      storedAt: new Date().toISOString(),
    };
    console.log('⚠️  Store your position secret safely:', record);
    // In browser: localStorage / encrypted IndexedDB
    // In CLI: ~/.futarchy/positions.json
  }
}

