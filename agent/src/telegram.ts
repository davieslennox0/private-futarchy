import axios from 'axios';
import { config } from './config';
import { logger } from './logger';

export class Telegram {
  private enabled: boolean;

  constructor() {
    this.enabled = !!(config.telegram.botToken && config.telegram.chatId);
    if (!this.enabled) logger.info('📵 Telegram alerts disabled (no token/chatId)');
  }

  async send(message: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await axios.post(
        `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
        {
          chat_id: config.telegram.chatId,
          text: message,
          parse_mode: 'Markdown',
        }
      );
    } catch (err) {
      logger.warn('Telegram send failed', { err });
    }
  }

  async marketProposed(title: string, marketPk: string, rationale: string) {
    await this.send(
      `🏛 *New Futarchy Market Proposed*\n\n` +
      `*${title}*\n` +
      `Market: \`${marketPk.slice(0, 16)}...\`\n` +
      `Rationale: ${rationale}`
    );
  }

  async marketResolved(title: string, outcome: string, oraclePrice: number) {
    const emoji = outcome === 'Yes' ? '✅' : '❌';
    await this.send(
      `${emoji} *Market Resolved*\n\n` +
      `*${title}*\n` +
      `Outcome: *${outcome}*\n` +
      `Oracle price: $${oraclePrice.toFixed(2)}`
    );
  }

  async anomalyDetected(anomalies: string[]) {
    await this.send(
      `⚠️ *Metric Anomalies Detected*\n\n` +
      anomalies.map((a) => `• ${a}`).join('\n')
    );
  }

  async policyExecuted(action: string) {
    await this.send(`📜 *Policy Executed*\n\n${action}`);
  }
}

