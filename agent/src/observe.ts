import { Connection, PublicKey } from '@solana/web3.js';
import { PriceServiceConnection } from '@pythnetwork/hermes-client';
import { config } from './config';
import { logger } from './logger';
import { AgentState, MetricDelta, ProtocolMetrics } from './types';

export class Observer {
  private pyth: PriceServiceConnection;
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    this.pyth = new PriceServiceConnection(config.pyth.priceServiceUrl, {
      priceFeedRequestConfig: { binary: true },
    });
  }

  // ── Main observe entry point ───────────────────────────────────────────────

  async observe(state: AgentState): Promise<{
    metrics: ProtocolMetrics;
    deltas: MetricDelta[];
    activeMarkets: any[];
  }> {
    logger.info('👁  Observing...');

    const [metrics, activeMarkets] = await Promise.all([
      this.fetchMetrics(),
      this.fetchActiveMarkets(),
    ]);

    const deltas = state.lastMetrics
      ? this.computeDeltas(state.lastMetrics, metrics)
      : [];

    if (deltas.length > 0) {
      const anomalies = deltas.filter((d) => d.isAnomaly);
      if (anomalies.length > 0) {
        logger.warn('⚠️  Anomalies detected', {
          anomalies: anomalies.map((a) => `${a.metric}: ${a.changePct.toFixed(2)}%`),
        });
      }
    }

    logger.info('📊 Metrics fetched', {
      solPrice: metrics.solPrice,
      btcPrice: metrics.btcPrice,
      activeMarkets: activeMarkets.length,
    });

    return { metrics, deltas, activeMarkets };
  }

  // ── Pyth price feeds ──────────────────────────────────────────────────────

  private async fetchMetrics(): Promise<ProtocolMetrics> {
    try {
      const feedIds = [
        config.pyth.feeds.SOL_USD,
        config.pyth.feeds.BTC_USD,
      ];

      const priceFeeds = await this.pyth.getLatestPriceFeeds(feedIds);

      const solFeed = priceFeeds?.find((f) =>
        f.id.toLowerCase().includes(config.pyth.feeds.SOL_USD.replace('0x', '').toLowerCase())
      );
      const btcFeed = priceFeeds?.find((f) =>
        f.id.toLowerCase().includes(config.pyth.feeds.BTC_USD.replace('0x', '').toLowerCase())
      );

      const solPrice = solFeed?.getPriceNoOlderThan(60)?.price
        ? Number(solFeed.getPriceNoOlderThan(60)!.price) *
          Math.pow(10, solFeed.getPriceNoOlderThan(60)!.expo)
        : 0;

      const btcPrice = btcFeed?.getPriceNoOlderThan(60)?.price
        ? Number(btcFeed.getPriceNoOlderThan(60)!.price) *
          Math.pow(10, btcFeed.getPriceNoOlderThan(60)!.expo)
        : 0;

      return {
        timestamp: Date.now(),
        solPrice,
        btcPrice,
      };
    } catch (err) {
      logger.error('Failed to fetch Pyth prices', { err });
      return {
        timestamp: Date.now(),
        solPrice: 0,
        btcPrice: 0,
      };
    }
  }

  // ── On-chain market accounts ───────────────────────────────────────────────

  private async fetchActiveMarkets(): Promise<any[]> {
    try {
      const programId = new PublicKey(config.solana.programId);

      // Fetch all program accounts with Market discriminator
      // Discriminator = sha256("account:Market")[0..8]
      const MARKET_DISCRIMINATOR = Buffer.from([
        // anchor discriminator for Market account — update after anchor build
        0x27, 0x9b, 0x3d, 0x6e, 0x4a, 0x1c, 0x8f, 0x22,
      ]);

      const accounts = await this.connection.getProgramAccounts(programId, {
        filters: [
          { memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR.toString('base64') } },
        ],
      });

      return accounts.map(({ pubkey, account }) => ({
        publicKey: pubkey.toBase58(),
        data: account.data,
      }));
    } catch (err) {
      logger.error('Failed to fetch active markets', { err });
      return [];
    }
  }

  // ── Delta computation ─────────────────────────────────────────────────────

  private computeDeltas(
    previous: ProtocolMetrics,
    current: ProtocolMetrics
  ): MetricDelta[] {
    const pairs: Array<[string, number, number]> = [
      ['SOL/USD', previous.solPrice, current.solPrice],
      ['BTC/USD', previous.btcPrice, current.btcPrice],
    ];

    if (previous.protocolTvl && current.protocolTvl) {
      pairs.push(['Protocol TVL', previous.protocolTvl, current.protocolTvl]);
    }

    return pairs
      .filter(([, prev]) => prev > 0)
      .map(([metric, prev, curr]) => {
        const changePct = ((curr - prev) / prev) * 100;
        return {
          metric,
          previous: prev,
          current: curr,
          changePct,
          // Anomaly = >5% move on any metric in one cycle
          isAnomaly: Math.abs(changePct) > 5,
        };
      });
  }
}

