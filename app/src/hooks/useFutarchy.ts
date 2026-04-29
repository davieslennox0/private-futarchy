import { useState, useEffect } from 'react';
import { Market, AgentEvent } from '../App';

// ── Mock markets for dev/demo ──────────────────────────────────────────────

const MOCK_MARKETS: Market[] = [
  {
    publicKey: '7kH3mQ9xVp2nR4tY8wL6cJ1bN5fA3gE0dI2sU7oP9qZ',
    title: 'Should protocol raise swap fees from 0.3% to 0.5%?',
    metricType: 'TokenPrice',
    targetValue: 180,
    closeTs: Math.floor(Date.now() / 1000) + 3600 * 2,
    resolveTs: Math.floor(Date.now() / 1000) + 3600 * 6,
    status: 'Open',
    outcome: null,
    positionCount: 14,
    totalCollateral: 2_400_000,
    oracleFeed: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  },
  {
    publicKey: 'Bp5mK2xTq8nL3rY9vW4cJ7fN6aE1gH0dI5sU2oR8qX',
    title: 'Should we allocate 20% of treasury to yield?',
    metricType: 'ProtocolTVL',
    targetValue: 5_000_000,
    closeTs: Math.floor(Date.now() / 1000) + 3600 * 5,
    resolveTs: Math.floor(Date.now() / 1000) + 3600 * 12,
    status: 'Open',
    outcome: null,
    positionCount: 8,
    totalCollateral: 900_000,
    oracleFeed: '',
  },
  {
    publicKey: 'Cm8pW3yRs6oL4nZ1vH5cK2fM9bG0eJ7dN4tU3aP1qY',
    title: 'Should protocol enable cross-chain bridging?',
    metricType: 'TokenPrice',
    targetValue: 160,
    closeTs: Math.floor(Date.now() / 1000) - 7200,
    resolveTs: Math.floor(Date.now() / 1000) - 3600,
    status: 'Resolved',
    outcome: 'Yes',
    positionCount: 31,
    totalCollateral: 8_700_000,
    oracleFeed: '',
  },
];

// ── Mock agent events ─────────────────────────────────────────────────────

function generateMockEvents(): AgentEvent[] {
  const now = Date.now();
  return [
    {
      id: '1',
      type: 'observe',
      message: 'SOL $172.43 · BTC $62,840 · 2 active markets · 14 positions',
      timestamp: now - 280_000,
    },
    {
      id: '2',
      type: 'decide',
      message: 'No anomalies detected. Monitoring active markets. No new proposal warranted.',
      timestamp: now - 275_000,
    },
    {
      id: '3',
      type: 'reflect',
      message: 'Cycle #42 complete. Next: monitor SOL price trend toward $180 target.',
      timestamp: now - 270_000,
    },
    {
      id: '4',
      type: 'observe',
      message: 'SOL $168.11 · BTC $62,840 · anomaly detected: SOL/USD -2.5%',
      timestamp: now - 120_000,
    },
    {
      id: '5',
      type: 'anomaly',
      message: 'SOL/USD: -2.5% in single cycle. Watching for sustained trend before new proposal.',
      timestamp: now - 115_000,
    },
    {
      id: '6',
      type: 'decide',
      message: 'Single-cycle dip. Not proposing yet — need 2 consecutive anomaly cycles. Continue monitoring.',
      timestamp: now - 112_000,
    },
    {
      id: '7',
      type: 'reflect',
      message: 'Cycle #43. SOL below trend. Next priority: confirm recovery or escalate.',
      timestamp: now - 110_000,
    },
    {
      id: '8',
      type: 'observe',
      message: 'SOL $165.30 · BTC $62,440 · anomaly: SOL/USD -1.7%',
      timestamp: now - 5_000,
    },
    {
      id: '9',
      type: 'anomaly',
      message: '2nd consecutive SOL decline. Total -4.1% from cycle #42 baseline.',
      timestamp: now - 4_500,
    },
    {
      id: '10',
      type: 'decide',
      message: 'Sustained decline triggers governance proposal. Proposing: "Should protocol reduce LP incentives to stabilize token price?"',
      timestamp: now - 4_000,
    },
    {
      id: '11',
      type: 'act',
      message: 'Market proposed on-chain. PDA: 7kH3mQ9... · Close: 2h · Resolve: 6h',
      timestamp: now - 3_500,
    },
    {
      id: '12',
      type: 'reflect',
      message: 'Cycle #44 complete. 3 active markets. Next: monitor proposal uptake.',
      timestamp: now - 3_000,
    },
  ];
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useFutarchy() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate initial load
    const t = setTimeout(() => {
      setMarkets(MOCK_MARKETS);
      setAgentEvents(generateMockEvents());
      setLoading(false);
    }, 800);

    return () => clearTimeout(t);
  }, []);

  // Simulate live agent event stream
  useEffect(() => {
    const id = setInterval(() => {
      const newEvent: AgentEvent = {
        id: Date.now().toString(),
        type: 'observe',
        message: `SOL $${(165 + Math.random() * 5).toFixed(2)} · BTC $${(62000 + Math.random() * 1000).toFixed(0)} · heartbeat`,
        timestamp: Date.now(),
      };
      setAgentEvents((prev) => [...prev.slice(-99), newEvent]);
    }, 30_000);

    return () => clearInterval(id);
  }, []);

  // TODO: Replace mock data with real RPC polling
  // useEffect(() => {
  //   const client = new FutarchyClient(RPC_URL, PROGRAM_ID, COLLATERAL_MINT);
  //   const poll = async () => {
  //     const mkts = await client.getAllMarkets();
  //     setMarkets(mkts);
  //   };
  //   poll();
  //   const id = setInterval(poll, 10_000);
  //   return () => clearInterval(id);
  // }, []);

  return { markets, agentEvents, loading, error };
}

