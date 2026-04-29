import React, { useState } from 'react';
import { Market } from '../App';

interface Props {
  market: Market;
  onClose: () => void;
}

type Step = 'form' | 'proving' | 'success' | 'loser';

export function ClaimModal({ market, onClose }: Props) {
  const [direction, setDirection] = useState<'YES' | 'NO' | null>(null);
  const [amount, setAmount] = useState('');
  const [nonce, setNonce] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [payout, setPayout] = useState(0);
  const [error, setError] = useState('');

  const canClaim = direction !== null && parseFloat(amount) > 0 && nonce.length === 64;

  async function handleClaim() {
    if (!canClaim) return;
    setStep('proving');
    setError('');

    try {
      // Simulate ZK proof generation + claim tx
      await new Promise((r) => setTimeout(r, 2000));

      const isWinner = direction === market.outcome;
      if (isWinner) {
        setPayout(parseFloat(amount) * 2);
        setStep('success');
      } else {
        setStep('loser');
      }
    } catch (e: any) {
      setError(e.message || 'Claim failed');
      setStep('form');
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">

        {step === 'form' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title">Claim Winnings</div>
                <div className="modal__subtitle">{market.title}</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>

            <div className="modal__body">
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: market.outcome === 'Yes' ? 'var(--green-dim)' : 'var(--red-dim)',
                border: `1px solid ${market.outcome === 'Yes' ? 'var(--green)' : 'var(--red)'}`,
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: market.outcome === 'Yes' ? 'var(--green)' : 'var(--red)',
              }}>
                Market resolved: {market.outcome === 'Yes' ? '✓ YES' : '✗ NO'}
              </div>

              <div className="privacy-notice">
                Reveal your position to generate a ZK proof of ownership.
                Your direction was hidden during the market — revealing now is safe.
              </div>

              <div className="field">
                <label className="field__label">Your Position Direction</label>
                <div className="direction-picker">
                  {(['YES', 'NO'] as const).map((d) => (
                    <button
                      key={d}
                      className={`direction-btn direction-btn--${d.toLowerCase()} ${direction === d ? 'direction-btn--selected' : ''}`}
                      onClick={() => setDirection(d)}
                    >
                      {d === 'YES' ? '✓ YES' : '✗ NO'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field__label">Your Collateral Amount (USDC)</label>
                <input
                  className="field__input"
                  type="number"
                  placeholder="10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label">Position Nonce (hex, 64 chars)</label>
                <input
                  className="field__input"
                  type="text"
                  placeholder="a3f9..."
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  style={{ fontSize: 11 }}
                />
                <div className="field__hint">From your position secret file</div>
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 8 }}>
                  {error}
                </div>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn--primary" disabled={!canClaim} onClick={handleClaim}>
                Generate Proof & Claim
              </button>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {step === 'proving' && (
          <div className="modal__body" style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div className="loading" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <div className="loading__spinner" />
              <span>Generating ZK proof...</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              Building Merkle inclusion proof + commitment opening
            </div>
          </div>
        )}

        {step === 'success' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title" style={{ color: 'var(--green)' }}>Claim Successful</div>
                <div className="modal__subtitle">You were on the winning side</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>
            <div className="modal__body" style={{ textAlign: 'center', padding: '24px' }}>
              <div style={{ fontSize: 32, color: 'var(--green)', marginBottom: 8 }}>✓</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--green)', marginBottom: 4 }}>
                +{payout.toFixed(2)} USDC
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                Transferred to your wallet
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {step === 'loser' && (
          <>
            <div className="modal__header">
              <div>
                <div className="modal__title" style={{ color: 'var(--red)' }}>No Payout</div>
                <div className="modal__subtitle">Your position was on the losing side</div>
              </div>
              <button className="modal__close" onClick={onClose}>×</button>
            </div>
            <div className="modal__body" style={{ textAlign: 'center', padding: '24px' }}>
              <div style={{ fontSize: 32, color: 'var(--red)', marginBottom: 8 }}>✗</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)' }}>
                Better signals next time.
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

