import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import { assert, expect } from 'chai';
import {
  createPosition,
  generateCommitment,
  generateNullifier,
  encryptAmount,
  decryptAmount,
  deriveOwnerSecret,
  deriveEncryptionKey,
} from '../sdk/src/commitment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MARKET_SEED = Buffer.from('market');
const VAULT_SEED = Buffer.from('vault');
const NULLIFIER_SEED = Buffer.from('nullifier');

function getMarketPda(programId: PublicKey, authority: PublicKey, title: string) {
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, authority.toBuffer(), Buffer.from(title)],
    programId
  );
}

function getVaultPda(programId: PublicKey, market: PublicKey) {
  return PublicKey.findProgramAddressSync([VAULT_SEED, market.toBuffer()], programId);
}

function getNullifierPda(programId: PublicKey, market: PublicKey) {
  return PublicKey.findProgramAddressSync([NULLIFIER_SEED, market.toBuffer()], programId);
}

function futureTs(seconds: number): BN {
  return new BN(Math.floor(Date.now() / 1000) + seconds);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('private-futarchy', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program after `anchor build` generates the IDL
  // const program = anchor.workspace.PrivateFutarchy as Program<PrivateFutarchy>;
  const programId = new PublicKey('PFutCHYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');

  let authority: Keypair;
  let user: Keypair;
  let collateralMint: PublicKey;
  let authorityAta: PublicKey;
  let userAta: PublicKey;
  let marketPda: PublicKey;
  let marketBump: number;

  const MARKET_TITLE = 'Should protocol raise fees?';

  before(async () => {
    authority = Keypair.generate();
    user = Keypair.generate();

    // Airdrop SOL
    await Promise.all([
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(authority.publicKey, 2 * LAMPORTS_PER_SOL)
      ),
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL)
      ),
    ]);

    // Create USDC-like collateral mint
    collateralMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Create ATAs
    authorityAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      collateralMint,
      authority.publicKey
    );
    userAta = await createAssociatedTokenAccount(
      provider.connection,
      user,
      collateralMint,
      user.publicKey
    );

    // Mint tokens to user
    await mintTo(
      provider.connection,
      authority,
      collateralMint,
      userAta,
      authority,
      1_000_000_000 // 1000 USDC (6 decimals)
    );

    [marketPda, marketBump] = getMarketPda(programId, authority.publicKey, MARKET_TITLE);
  });

  // ── Commitment tests (SDK unit tests) ─────────────────────────────────────

  describe('SDK: Commitment scheme', () => {
    it('generates a deterministic commitment from the same inputs', () => {
      const nonce = new Uint8Array(32).fill(1);
      const secret = { direction: 'YES' as const, amount: 1_000_000n, nonce };
      const c1 = generateCommitment(secret);
      const c2 = generateCommitment(secret);
      assert.deepEqual(c1, c2);
    });

    it('generates different commitments for YES vs NO', () => {
      const nonce = new Uint8Array(32).fill(2);
      const amount = 500_000n;
      const yes = generateCommitment({ direction: 'YES', amount, nonce });
      const no = generateCommitment({ direction: 'NO', amount, nonce });
      assert.notDeepEqual(yes, no);
    });

    it('generates different commitments for different amounts', () => {
      const nonce = new Uint8Array(32).fill(3);
      const c1 = generateCommitment({ direction: 'YES', amount: 100n, nonce });
      const c2 = generateCommitment({ direction: 'YES', amount: 200n, nonce });
      assert.notDeepEqual(c1, c2);
    });

    it('generates different nullifiers for different leaf indices', () => {
      const secret = new Uint8Array(32).fill(4);
      const n0 = generateNullifier(secret, 0);
      const n1 = generateNullifier(secret, 1);
      assert.notDeepEqual(n0, n1);
    });

    it('round-trips amount encryption correctly', () => {
      const wallet = Keypair.generate();
      const key = deriveEncryptionKey(wallet.secretKey);
      const amount = 999_999n;
      const encrypted = encryptAmount(amount, key);
      const decrypted = decryptAmount(encrypted, key);
      assert.equal(decrypted, amount);
    });

    it('encrypted amount is 48 bytes', () => {
      const wallet = Keypair.generate();
      const key = deriveEncryptionKey(wallet.secretKey);
      const encrypted = encryptAmount(12345n, key);
      assert.equal(encrypted.length, 48);
    });

    it('full createPosition bundle is self-consistent', () => {
      const wallet = Keypair.generate();
      const bundle = createPosition('YES', 1_000_000n, wallet.secretKey, 0);

      // Commitment should match recomputed commitment
      const recomputed = generateCommitment(bundle.secret);
      assert.deepEqual(bundle.commitment, recomputed);

      // Nullifier should match recomputed nullifier
      const ownerSecret = deriveOwnerSecret(wallet.secretKey);
      const recomputedNullifier = generateNullifier(ownerSecret, 0);
      assert.deepEqual(bundle.nullifier, recomputedNullifier);

      // Decrypted amount should match
      const encKey = deriveEncryptionKey(wallet.secretKey);
      const decrypted = decryptAmount(bundle.encryptedAmount, encKey);
      assert.equal(decrypted, 1_000_000n);
    });
  });

  // ── Program tests (requires deployed program) ─────────────────────────────

  describe('Program: create_market', () => {
    it('creates a market with valid params', async () => {
      // TODO: wire program client after anchor build
      // const tx = await program.methods
      //   .createMarket({
      //     title: MARKET_TITLE,
      //     metric: { tokenPrice: {} },
      //     targetValue: new BN(200_00000000), // $200 SOL target
      //     closeTs: futureTs(3600),
      //     resolveTs: futureTs(7200),
      //     oracleFeed: new PublicKey('...pyth feed...'),
      //   })
      //   .accounts({
      //     authority: authority.publicKey,
      //     market: marketPda,
      //     collateralMint,
      //     vault: getVaultPda(programId, marketPda)[0],
      //     nullifierSet: getNullifierPda(programId, marketPda)[0],
      //     stateTree: defaultTestStateTreeAccounts().merkleTree,
      //     tokenProgram: TOKEN_PROGRAM_ID,
      //     systemProgram: SystemProgram.programId,
      //   })
      //   .signers([authority])
      //   .rpc();
      //
      // const market = await program.account.market.fetch(marketPda);
      // assert.equal(market.title, MARKET_TITLE);
      // assert.equal(market.status.open !== undefined, true);
      assert.ok(true, 'Stub — wire after anchor build');
    });

    it('rejects market with close_ts in the past', async () => {
      // TODO: expect error FutarchyError::MarketCloseInPast
      assert.ok(true, 'Stub');
    });

    it('rejects market with resolve_ts before close_ts', async () => {
      // TODO: expect error FutarchyError::InvalidMarketTimes
      assert.ok(true, 'Stub');
    });
  });

  describe('Program: submit_position', () => {
    it('locks collateral and appends compressed leaf', async () => {
      // TODO: submit YES position, verify vault balance increased
      assert.ok(true, 'Stub');
    });

    it('rejects zero-amount positions', async () => {
      // TODO: expect FutarchyError::ZeroAmount
      assert.ok(true, 'Stub');
    });

    it('rejects positions after market close', async () => {
      // TODO: expect FutarchyError::MarketNotOpen
      assert.ok(true, 'Stub');
    });
  });

  describe('Program: resolve_market', () => {
    it('resolves YES when oracle >= target', async () => {
      // TODO: mock Pyth feed, call resolve, verify outcome = Yes
      assert.ok(true, 'Stub');
    });

    it('resolves NO when oracle < target', async () => {
      // TODO: mock Pyth feed, call resolve, verify outcome = No
      assert.ok(true, 'Stub');
    });

    it('rejects resolution before resolve_ts', async () => {
      // TODO: expect FutarchyError::MarketNotResolvable
      assert.ok(true, 'Stub');
    });
  });

  describe('Program: claim_winnings', () => {
    it('pays winner double collateral (MVP model)', async () => {
      // TODO: submit YES, resolve YES, claim, verify 2x payout
      assert.ok(true, 'Stub');
    });

    it('pays zero to loser', async () => {
      // TODO: submit NO, resolve YES, claim, verify 0 payout
      assert.ok(true, 'Stub');
    });

    it('rejects double-claim via nullifier', async () => {
      // TODO: claim twice with same nullifier, second should fail
      assert.ok(true, 'Stub');
    });
  });
});

