// ─── Protocol Metrics ────────────────────────────────────────────────────────

export interface ProtocolMetrics {
  timestamp: number;
  solPrice: number;
  btcPrice: number;
  // Extend with real protocol data from your target (e.g. Kamino TVL, Drift volume)
  // These come from the observe() step via RPC/API calls
  protocolTvl?: number;
  protocolRevenue24h?: number;
  governanceTokenPrice?: number;
  activeMarkets?: number;
}

export interface MetricDelta {
  metric: string;
  previous: number;
  current: number;
  changePct: number;
  isAnomaly: boolean;
}

// ─── Market Proposal ─────────────────────────────────────────────────────────

export interface MarketProposal {
  title: string;
  description: string;
  metricType: 'TokenPrice' | 'ProtocolTVL' | 'ProtocolRevenue' | 'CustomU64';
  targetValue: number;
  closeInHours: number;
  resolveInHours: number;
  oracleFeedId: string;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  shouldCreate: boolean;
}

// ─── Agent State ─────────────────────────────────────────────────────────────

export interface AgentState {
  cycleCount: number;
  lastObserveTs: number;
  lastMetrics: ProtocolMetrics | null;
  activeMarkets: ActiveMarket[];
  resolvedMarkets: ResolvedMarket[];
  proposalHistory: MarketProposal[];
  reflections: Reflection[];
}

export interface ActiveMarket {
  publicKey: string;
  title: string;
  createdAt: number;
  closeTs: number;
  resolveTs: number;
  positionCount: number;
  totalCollateral: number;
}

export interface ResolvedMarket {
  publicKey: string;
  title: string;
  outcome: 'Yes' | 'No';
  resolvedAt: number;
  oraclePrice: number;
  targetValue: number;
  policyExecuted?: string;
}

export interface Reflection {
  cycleCount: number;
  timestamp: number;
  summary: string;
  anomaliesDetected: string[];
  actionsProposed: string[];
  actionsExecuted: string[];
  nextCyclePriority: string;
}

// ─── Brain Output ─────────────────────────────────────────────────────────────

export interface BrainDecision {
  shouldPropose: boolean;
  proposal?: MarketProposal;
  shouldResolve: string[];   // market pubkeys ready to resolve
  shouldExecute: string[];   // market pubkeys with policy to execute post-resolve
  reasoning: string;
  anomalies: string[];
}

