import React, { useState } from 'react';
import { Market } from '../App';

interface Props {
  market: Market;
  onClose: () => void;
}

type Direction = 'YES' | 'NO' | null;
type Step = 'form' | 'confirm' | 'success';

export function PositionModal({ market, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>(null);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  const amountNum = parseFloat(amount);
  const canSubmit = direction !== null && amountNum > 0 && !isNaN(amountNum);

  async function handleSubmit() {
    if (!canSubmit) return;
    setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    try {
      // TODO: call SDK submitPosition once wallet adapter is wired
      // const result = await client.submitPosition(wallet, {
      //   marketPubkey: new PublicKey(market.publicKey),
      //   direction,
      //   collateralAmount: BigInt(Math.floor(amountNum * 1_000_000)),
      // });
      await new Promise((r) => setTimeout(r, 1500)); // simulate tx
      setTxid('demo_' + Math.random().toString(36).slice(2, 12));
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">

        {/* ── Form step ── */}
        {step === 'form' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title">Submit Position</div>
                <div className="modal__subtitle">{market.title}</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>

            <div className="modal__body">
              <div className="privacy-notice">
                ◈ Your vote direction is encrypted client-side using ZK compression.
                Only your collateral amount is visible on-chain.
              </div>

              <div className="field">
                <label className="field__label">Your Prediction</label>
                <div className="direction-picker">
                  <button
                    className={`direction-btn direction-btn--yes ${direction === 'YES' ? 'direction-btn--selected' : ''}`}
                    onClick={() => setDirection('YES')}
                  >
                    ✓ YES
                  </button>
                  <button
                    className={`direction-btn direction-btn--no ${direction === 'NO' ? 'direction-btn--selected' : ''}`}
                    onClick={() => setDirection('NO')}
                  >
                    ✗ NO
                  </button>
                </div>
              </div>

              <div className="field">
                <label className="field__label">Collateral Amount (USDC)</label>
                <input
                  className="field__input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="field__hint">Locked until market resolves</div>
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 12 }}>
                  {error}
                </div>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn--primary" disabled={!canSubmit} onClick={handleSubmit}>
                Review Position
              </button>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Confirm step ── */}
        {step === 'confirm' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title">Confirm</div>
                <div className="modal__subtitle">Review before submitting</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>

            <div className="modal__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {[
                  ['Market', market.title],
                  ['Direction', `[ ZK-PRIVATE ]`],
                  ['Collateral', `${amount} USDC`],
                  ['Lock until', new Date(market.resolveTs * 1000).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    padding: '10px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}>
                    <span style={{ color: 'var(--text-3)' }}>{label}</span>
                    <span style={{ color: label === 'Direction' ? 'var(--accent)' : 'var(--text)' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="privacy-notice">
                Your direction is committed client-side. Even on-chain, only your
                collateral amount is visible. You will need your wallet to claim.
              </div>
            </div>

            <div className="modal__footer">
              <button className="btn btn--primary" disabled={submitting} onClick={handleConfirm}>
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
              <button className="btn btn--ghost" onClick={() => setStep('form')}>Back</button>
            </div>
          </>
        )}

        {/* ── Success step ── */}
        {step === 'success' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title">Position Submitted</div>
                <div className="modal__subtitle">Your vote is locked and private</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>

            <div className="modal__body">
              <div style={{
                textAlign: 'center', padding: '20px 0',
                fontFamily: 'var(--font-mono)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--green)' }}>◈</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                  Position committed to ZK state tree
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', wordBreak: 'break-all' }}>
                  txid: {txid}
                </div>
              </div>

              <div className="privacy-notice" style={{ marginTop: 16 }}>
                ⚠ Save your wallet keypair. You will need it to prove ownership
                and claim winnings after resolution.
              </div>
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

