import React, { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { MarketCard } from './components/MarketCard';
import { PositionModal } from './components/PositionModal';
import { ClaimModal } from './components/ClaimModal';
import { AgentFeed } from './components/AgentFeed';
import { Header } from './components/Header';
import { useFutarchy } from './hooks/useFutarchy';
import './styles/global.css';

export interface Market {
  publicKey: string;
  title: string;
  description?: string;
  metricType: string;
  targetValue: number;
  closeTs: number;
  resolveTs: number;
  status: 'Open' | 'Closed' | 'Resolved' | 'Cancelled';
  outcome: 'Yes' | 'No' | null;
  positionCount: number;
  totalCollateral: number;
  oracleFeed: string;
}

export interface AgentEvent {
  id: string;
  type: 'observe' | 'decide' | 'act' | 'reflect' | 'anomaly' | 'proposal';
  message: string;
  timestamp: number;
  data?: any;
}

function App() {
  const { markets, agentEvents, loading, error } = useFutarchy();
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [showPosition, setShowPosition] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [activeTab, setActiveTab] = useState<'markets' | 'agent'>('markets');

  const openMarkets = markets.filter((m) => m.status === 'Open');
  const resolvedMarkets = markets.filter((m) => m.status === 'Resolved');

  return (
    <div className="app">
      <Header />

      <main className="main">
        {/* Tab bar */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'markets' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('markets')}
          >
            <span className="tab__icon">◈</span>
            Markets
            {openMarkets.length > 0 && (
              <span className="tab__badge">{openMarkets.length}</span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'agent' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('agent')}
          >
            <span className="tab__icon">⬡</span>
            Agent Feed
            {agentEvents.filter((e) => e.type === 'anomaly').length > 0 && (
              <span className="tab__badge tab__badge--alert">
                {agentEvents.filter((e) => e.type === 'anomaly').length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'markets' && (
          <div className="markets-view">
            {loading && (
              <div className="loading">
                <div className="loading__spinner" />
                <span>Syncing markets...</span>
              </div>
            )}

            {!loading && openMarkets.length === 0 && resolvedMarkets.length === 0 && (
              <div className="empty">
                <div className="empty__icon">◈</div>
                <p>No markets yet. The agent is watching.</p>
              </div>
            )}

            {openMarkets.length > 0 && (
              <section className="market-section">
                <h2 className="section-title">
                  <span className="section-title__dot section-title__dot--open" />
                  Open
                </h2>
                <div className="market-grid">
                  {openMarkets.map((market) => (
                    <MarketCard
                      key={market.publicKey}
                      market={market}
                      onVote={() => {
                        setSelectedMarket(market);
                        setShowPosition(true);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {resolvedMarkets.length > 0 && (
              <section className="market-section">
                <h2 className="section-title">
                  <span className="section-title__dot section-title__dot--resolved" />
                  Resolved
                </h2>
                <div className="market-grid">
                  {resolvedMarkets.map((market) => (
                    <MarketCard
                      key={market.publicKey}
                      market={market}
                      onClaim={() => {
                        setSelectedMarket(market);
                        setShowClaim(true);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'agent' && (
          <AgentFeed events={agentEvents} />
        )}
      </main>

      {showPosition && selectedMarket && (
        <PositionModal
          market={selectedMarket}
          onClose={() => { setShowPosition(false); setSelectedMarket(null); }}
        />
      )}

      {showClaim && selectedMarket && (
        <ClaimModal
          market={selectedMarket}
          onClose={() => { setShowClaim(false); setSelectedMarket(null); }}
        />
      )}
    </div>
  );
}

export default App;

