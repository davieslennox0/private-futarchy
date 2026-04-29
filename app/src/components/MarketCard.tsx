import React, { useEffect, useState } from 'react';
import { Market } from '../App';

interface Props {
  market: Market;
  onVote?: () => void;
  onClaim?: () => void;
}

function useCountdown(targetTs: number) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function update() {
      const diff = targetTs * 1000 - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  return remaining;
}

export function MarketCard({ market, onVote, onClaim }: Props) {
  const isOpen = market.status === 'Open';
  const isResolved = market.status === 'Resolved';

  const closeCountdown = useCountdown(market.closeTs);
  const resolveCountdown = useCountdown(market.resolveTs);

  const cardClass = [
    'market-card',
    isOpen ? 'market-card--open' : '',
    isResolved && market.outcome === 'Yes' ? 'market-card--resolved-yes' : '',
    isResolved && market.outcome === 'No' ? 'market-card--resolved-no' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className="market-card__meta">
        <span className={`market-card__status market-card__status--${isOpen ? 'open' : 'resolved'}`}>
          {market.status}
        </span>
        <span className="market-card__positions">
          {market.positionCount} position{market.positionCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="market-card__title">{market.title}</div>

      <div className="market-card__stats">
        <div className="market-card__stat">
          <div className="market-card__stat-label">Target</div>
          <div className="market-card__stat-value">
            {market.metricType === 'TokenPrice'
              ? `$${market.targetValue.toLocaleString()}`
              : market.targetValue.toLocaleString()}
          </div>
        </div>
        <div className="market-card__stat">
          <div className="market-card__stat-label">Collateral</div>
          <div className="market-card__stat-value">
            {(market.totalCollateral / 1_000_000).toFixed(2)} USDC
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="market-card__timer">
          <span className="market-card__timer-label">Closes: </span>
          {closeCountdown}
          {'  ·  '}
          <span className="market-card__timer-label">Resolves: </span>
          {resolveCountdown}
        </div>
      )}

      {isResolved && market.outcome && (
        <div className={`market-card__outcome market-card__outcome--${market.outcome.toLowerCase()}`}>
          Resolved: {market.outcome === 'Yes' ? '✓ YES' : '✗ NO'}
        </div>
      )}

      {isOpen && onVote && (
        <button className="market-card__action" onClick={onVote}>
          Submit Private Position
        </button>
      )}

      {isResolved && onClaim && (
        <button className="market-card__action market-card__action--claim" onClick={onClaim}>
          Claim Winnings
        </button>
      )}
    </div>
  );
}

