import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import {
  AgentState,
  BrainDecision,
  MetricDelta,
  ProtocolMetrics,
  Reflection,
} from './types';

const STATE_FILE = path.join(process.cwd(), 'state.json');

export class Reflector {

  // ── Persist state to disk ─────────────────────────────────────────────────

  saveState(state: AgentState): void {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      logger.error('Failed to save state', { err });
    }
  }

  loadState(): AgentState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const state = JSON.parse(raw) as AgentState;
        logger.info('📂 State loaded', {
          cycleCount: state.cycleCount,
          activeMarkets: state.activeMarkets.length,
          resolvedMarkets: state.resolvedMarkets.length,
        });
        return state;
      }
    } catch (err) {
      logger.warn('Could not load state, starting fresh', { err });
    }

    return this.initialState();
  }

  // ── Generate reflection ───────────────────────────────────────────────────

  reflect(
    state: AgentState,
    metrics: ProtocolMetrics,
    deltas: MetricDelta[],
    decision: BrainDecision,
    actResults: { proposed: string | null; resolved: string[]; executed: string[] }
  ): Reflection {
    const anomalies = deltas
      .filter((d) => d.isAnomaly)
      .map((d) => `${d.metric}: ${d.changePct > 0 ? '+' : ''}${d.changePct.toFixed(2)}%`);

    const actionsProposed = decision.shouldPropose && decision.proposal
      ? [`Proposed market: "${decision.proposal.title}" (confidence: ${decision.proposal.confidence})`]
      : ['No market proposed'];

    const actionsExecuted = [
      ...actResults.resolved.map((m) => `Resolved market ${m.slice(0, 8)}...`),
      ...actResults.executed.map((a) => `Executed policy: ${a}`),
    ];

    const nextPriority = this.deriveNextPriority(state, decision, anomalies);

    const reflection: Reflection = {
      cycleCount: state.cycleCount,
      timestamp: Date.now(),
      summary: this.buildSummary(metrics, anomalies, actResults),
      anomaliesDetected: anomalies,
      actionsProposed,
      actionsExecuted,
      nextCyclePriority: nextPriority,
    };

    logger.info('🪞 Reflection', {
      cycle: state.cycleCount,
      summary: reflection.summary,
      nextPriority,
    });

    return reflection;
  }

  // ── State update helpers ──────────────────────────────────────────────────

  updateState(
    state: AgentState,
    metrics: ProtocolMetrics,
    decision: BrainDecision,
    actResults: { proposed: string | null; resolved: string[]; executed: string[] },
    reflection: Reflection
  ): AgentState {
    const updated: AgentState = {
      ...state,
      cycleCount: state.cycleCount + 1,
      lastObserveTs: Date.now(),
      lastMetrics: metrics,
      reflections: [...state.reflections.slice(-49), reflection], // keep last 50
    };

    // Track new proposal in history
    if (decision.proposal) {
      updated.proposalHistory = [
        ...state.proposalHistory.slice(-19),
        decision.proposal,
      ];
    }

    // Track proposed market as active
    if (actResults.proposed) {
      updated.activeMarkets = [
        ...state.activeMarkets,
        {
          publicKey: actResults.proposed,
          title: decision.proposal?.title || 'Unknown',
          createdAt: Date.now(),
          closeTs: Date.now() + (decision.proposal?.closeInHours || 4) * 3600000,
          resolveTs: Date.now() + (decision.proposal?.resolveInHours || 8) * 3600000,
          positionCount: 0,
          totalCollateral: 0,
        },
      ];
    }

    // Move resolved markets
    if (actResults.resolved.length > 0) {
      const resolvedSet = new Set(actResults.resolved);
      updated.activeMarkets = state.activeMarkets.filter(
        (m) => !resolvedSet.has(m.publicKey)
      );
    }

    return updated;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildSummary(
    metrics: ProtocolMetrics,
    anomalies: string[],
    actResults: { proposed: string | null; resolved: string[]; executed: string[] }
  ): string {
    const parts: string[] = [];
    parts.push(`SOL $${metrics.solPrice.toFixed(2)}, BTC $${metrics.btcPrice.toFixed(2)}`);
    if (anomalies.length > 0) parts.push(`anomalies: ${anomalies.join(', ')}`);
    if (actResults.proposed) parts.push(`market proposed`);
    if (actResults.resolved.length > 0) parts.push(`${actResults.resolved.length} resolved`);
    if (actResults.executed.length > 0) parts.push(`${actResults.executed.length} policies executed`);
    return parts.join(' | ');
  }

  private deriveNextPriority(
    state: AgentState,
    decision: BrainDecision,
    anomalies: string[]
  ): string {
    if (decision.shouldResolve.length > 0) return 'Confirm market resolutions settled';
    if (anomalies.length > 0) return `Monitor anomaly trend: ${anomalies[0]}`;
    if (state.activeMarkets.length === 0) return 'Watch for governance triggers';
    return `Monitor ${state.activeMarkets.length} active market(s)`;
  }

  private initialState(): AgentState {
    return {
      cycleCount: 0,
      lastObserveTs: 0,
      lastMetrics: null,
      activeMarkets: [],
      resolvedMarkets: [],
      proposalHistory: [],
      reflections: [],
    };
  }
}

