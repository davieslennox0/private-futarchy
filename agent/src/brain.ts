import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { logger } from './logger';
import {
  AgentState,
  BrainDecision,
  MetricDelta,
  ProtocolMetrics,
} from './types';

const SYSTEM_PROMPT = `You are the autonomous governance brain of a Private Futarchy protocol on Solana.

Your role is to monitor protocol health metrics and decide when to propose futarchy markets — prediction markets where the outcome determines governance policy.

FUTARCHY LOGIC:
- A futarchy market asks: "Should we enact Policy X?"
- Two sub-markets run: token price IF policy passes vs. IF it doesn't
- The market that predicts higher token price wins — that policy is enacted
- Individual positions are ZK-private (hidden direction, locked collateral)

YOUR DECISION FRAMEWORK:

1. PROPOSE a market when:
   - A metric has moved >5% in a single cycle (anomaly)
   - A metric trend over multiple cycles suggests a governance lever should be pulled
   - An existing market has resolved and a follow-up is warranted
   - No active market exists for a clearly stressed metric

2. DO NOT propose when:
   - A market for the same metric is already active
   - Market conditions are stable (no anomalies, no trend)
   - Less than 2 hours since the last proposal
   - Confidence is low

3. RESOLVE markets when resolve_ts has passed

4. EXECUTE policy when a market resolves YES (describe what onchain action would occur)

MARKET DESIGN RULES:
- Title must be a clear YES/NO governance question, max 64 chars
- target_value is the metric threshold for YES outcome
- close window: 1-6 hours (positions open)
- resolve window: close + 1-24 hours (oracle settles)
- Prefer SOL/USD or BTC/USD for price markets (Pyth feeds available)

RESPONSE FORMAT:
Always respond with valid JSON only. No markdown, no preamble.

{
  "shouldPropose": boolean,
  "proposal": {
    "title": string (max 64 chars, clear governance question),
    "description": string (2-3 sentences explaining the market),
    "metricType": "TokenPrice" | "ProtocolTVL" | "ProtocolRevenue" | "CustomU64",
    "targetValue": number (raw value, same scale as oracle),
    "closeInHours": number,
    "resolveInHours": number,
    "oracleFeedId": string (pyth feed hex id),
    "rationale": string (1 sentence),
    "confidence": "high" | "medium" | "low",
    "shouldCreate": boolean
  } | null,
  "shouldResolve": string[],
  "shouldExecute": string[],
  "reasoning": string (2-3 sentences, your analysis),
  "anomalies": string[]
}`;

export class Brain {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }

  async decide(
    metrics: ProtocolMetrics,
    deltas: MetricDelta[],
    activeMarkets: any[],
    state: AgentState
  ): Promise<BrainDecision> {
    logger.info('🧠 Thinking...');

    const prompt = this.buildPrompt(metrics, deltas, activeMarkets, state);

    try {
      const response = await this.client.messages.create({
        model: config.anthropic.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('');

      const decision = this.parseDecision(raw);

      logger.info('🧠 Decision made', {
        shouldPropose: decision.shouldPropose,
        anomalies: decision.anomalies,
        reasoning: decision.reasoning,
      });

      return decision;
    } catch (err) {
      logger.error('Brain failed', { err });
      return this.defaultDecision();
    }
  }

  private buildPrompt(
    metrics: ProtocolMetrics,
    deltas: MetricDelta[],
    activeMarkets: any[],
    state: AgentState
  ): string {
    const recentReflections = state.reflections.slice(-3);

    return `CURRENT METRICS (cycle #${state.cycleCount}):
${JSON.stringify(metrics, null, 2)}

METRIC DELTAS FROM LAST CYCLE:
${deltas.length > 0
  ? deltas.map((d) => `  ${d.metric}: ${d.changePct > 0 ? '+' : ''}${d.changePct.toFixed(2)}% (${d.isAnomaly ? '⚠️ ANOMALY' : 'normal'})`).join('\n')
  : '  No previous cycle data'}

ACTIVE MARKETS (${activeMarkets.length}):
${activeMarkets.length > 0
  ? JSON.stringify(activeMarkets.slice(0, 5), null, 2)
  : '  None'}

RESOLVED MARKETS (last 5):
${state.resolvedMarkets.slice(-5).length > 0
  ? JSON.stringify(state.resolvedMarkets.slice(-5), null, 2)
  : '  None'}

RECENT REFLECTIONS:
${recentReflections.length > 0
  ? recentReflections.map((r) => `  [Cycle ${r.cycleCount}] ${r.summary}`).join('\n')
  : '  No prior reflections'}

PROPOSAL HISTORY (last 3):
${state.proposalHistory.slice(-3).length > 0
  ? state.proposalHistory.slice(-3).map((p) => `  "${p.title}" — confidence: ${p.confidence}`).join('\n')
  : '  None'}

AVAILABLE PYTH FEEDS:
  SOL/USD: ${config.pyth.feeds.SOL_USD}
  BTC/USD: ${config.pyth.feeds.BTC_USD}

Analyze the above and return your decision as JSON.`;
  }

  private parseDecision(raw: string): BrainDecision {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      return {
        shouldPropose: Boolean(parsed.shouldPropose),
        proposal: parsed.proposal || undefined,
        shouldResolve: Array.isArray(parsed.shouldResolve) ? parsed.shouldResolve : [],
        shouldExecute: Array.isArray(parsed.shouldExecute) ? parsed.shouldExecute : [],
        reasoning: parsed.reasoning || 'No reasoning provided',
        anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      };
    } catch (err) {
      logger.error('Failed to parse brain response', { raw, err });
      return this.defaultDecision();
    }
  }

  private defaultDecision(): BrainDecision {
    return {
      shouldPropose: false,
      shouldResolve: [],
      shouldExecute: [],
      reasoning: 'Brain error — defaulting to no action',
      anomalies: [],
    };
  }
}

