import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'YES' | 'NO';

export interface PositionSecret {
  direction: Direction;
  amount: bigint;          // lamports / token base units
  nonce: Uint8Array;       // 32-byte random nonce
}

export interface PositionCommitment {
  commitment: Uint8Array;  // 32-byte Pedersen-style commitment
  nullifier: Uint8Array;   // 32-byte nullifier hash
  encryptedAmount: Uint8Array; // 48-byte AES-256-GCM encrypted amount
  secret: PositionSecret;  // KEEP PRIVATE — user stores this
}

// ─── Commitment generation ────────────────────────────────────────────────────
//
// commit(direction, amount, nonce) = SHA256(direction_byte || amount_le_8 || nonce_32)
//
// This is a hash-based commitment — simple and auditable for an MVP.
// Production upgrade: Poseidon hash + Pedersen commitment for ZK circuit compatibility.
//

export function generateCommitment(secret: PositionSecret): Uint8Array {
  const directionByte = secret.direction === 'YES' ? 1 : 0;
  const amountBytes = amountToBytes(secret.amount);

  const preimage = Buffer.concat([
    Buffer.from([directionByte]),
    amountBytes,
    Buffer.from(secret.nonce),
  ]);

  return new Uint8Array(createHash('sha256').update(preimage).digest());
}

// ─── Nullifier ────────────────────────────────────────────────────────────────
//
// nullifier = SHA256(owner_secret || leaf_index)
// owner_secret is derived from the wallet keypair — only the owner can compute it.
//

export function generateNullifier(
  ownerSecret: Uint8Array,  // 32 bytes from keypair or HMAC
  leafIndex: number
): Uint8Array {
  const indexBytes = Buffer.alloc(4);
  indexBytes.writeUInt32LE(leafIndex, 0);

  const preimage = Buffer.concat([Buffer.from(ownerSecret), indexBytes]);
  return new Uint8Array(createHash('sha256').update(preimage).digest());
}

// ─── Amount encryption ────────────────────────────────────────────────────────
//
// AES-256-GCM encrypt the amount so it's recoverable by the owner but
// opaque to observers. Key is derived from the owner's wallet signing key.
//
// Output: 12-byte IV + 8-byte ciphertext + 16-byte GCM tag = 36 bytes
// Padded to 48 bytes for alignment.
//

export function encryptAmount(amount: bigint, encryptionKey: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const amountBytes = amountToBytes(amount);

  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(amountBytes), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: [iv(12)] [ciphertext(8)] [tag(16)] [padding(12)] = 48 bytes
  const result = Buffer.alloc(48);
  iv.copy(result, 0);
  ciphertext.copy(result, 12);
  tag.copy(result, 20);
  return new Uint8Array(result);
}

export function decryptAmount(
  encryptedAmount: Uint8Array,
  encryptionKey: Uint8Array
): bigint {
  const buf = Buffer.from(encryptedAmount);
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12, 20);
  const tag = buf.slice(20, 36);

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return bytesToAmount(plaintext);
}

// ─── Key derivation ───────────────────────────────────────────────────────────
//
// Derive deterministic keys from the wallet keypair so the user doesn't need
// to store extra secrets. The wallet IS the secret.
//

export function deriveOwnerSecret(walletSecretKey: Uint8Array): Uint8Array {
  // HMAC-SHA256(secretKey, "private-futarchy:owner-secret")
  const hmac = createHash('sha256')
    .update(Buffer.from(walletSecretKey))
    .update('private-futarchy:owner-secret')
    .digest();
  return new Uint8Array(hmac);
}

export function deriveEncryptionKey(walletSecretKey: Uint8Array): Uint8Array {
  const hmac = createHash('sha256')
    .update(Buffer.from(walletSecretKey))
    .update('private-futarchy:encryption-key')
    .digest();
  return new Uint8Array(hmac);
}

// ─── Full position bundle generation ─────────────────────────────────────────

export function createPosition(
  direction: Direction,
  amount: bigint,
  walletSecretKey: Uint8Array,
  leafIndex: number
): PositionCommitment {
  const nonce = new Uint8Array(randomBytes(32));
  const secret: PositionSecret = { direction, amount, nonce };

  const ownerSecret = deriveOwnerSecret(walletSecretKey);
  const encryptionKey = deriveEncryptionKey(walletSecretKey);

  return {
    commitment: generateCommitment(secret),
    nullifier: generateNullifier(ownerSecret, leafIndex),
    encryptedAmount: encryptAmount(amount, encryptionKey),
    secret,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function amountToBytes(amount: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(amount, 0);
  return buf;
}

function bytesToAmount(buf: Buffer): bigint {
  return buf.readBigUInt64LE(0);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

