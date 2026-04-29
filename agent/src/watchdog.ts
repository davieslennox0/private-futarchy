import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const HEARTBEAT_FILE = path.join(process.cwd(), 'state.json');
const MAX_STALE_MS = 15 * 60 * 1000;   // 15 min — two missed cycles = stale
const CHECK_INTERVAL_MS = 60 * 1000;    // check every minute

export class Watchdog {
  private timer: NodeJS.Timeout | null = null;
  private lastHeartbeatCycle = 0;

  start() {
    logger.info('🐕 Watchdog started');
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  // Called by the main loop at the end of each cycle
  ping(cycleCount: number) {
    this.lastHeartbeatCycle = cycleCount;
  }

  private check() {
    try {
      this.checkStateFile();
      this.checkMemory();
      this.checkDiskSpace();
    } catch (err) {
      logger.error('Watchdog check failed', { err });
    }
  }

  // ── State file freshness ──────────────────────────────────────────────────

  private checkStateFile() {
    if (!fs.existsSync(HEARTBEAT_FILE)) {
      logger.warn('⚠️  Watchdog: state.json missing');
      return;
    }

    const stat = fs.statSync(HEARTBEAT_FILE);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > MAX_STALE_MS) {
      logger.error('💀 Watchdog: state.json stale — agent may be hung', {
        ageMinutes: (ageMs / 60000).toFixed(1),
      });
      // PM2 will auto-restart if the process crashes.
      // For hung processes: throw to force a restart.
      throw new Error('Agent state stale — forcing restart');
    }
  }

  // ── Memory ────────────────────────────────────────────────────────────────

  private checkMemory() {
    const used = process.memoryUsage();
    const heapMB = used.heapUsed / 1024 / 1024;

    if (heapMB > 512) {
      logger.warn('⚠️  Watchdog: high heap usage', { heapMB: heapMB.toFixed(1) });
    }

    if (heapMB > 900) {
      logger.error('💀 Watchdog: heap critical — forcing restart', { heapMB: heapMB.toFixed(1) });
      throw new Error('Heap critical — forcing restart');
    }
  }

  // ── Disk space ────────────────────────────────────────────────────────────

  private checkDiskSpace() {
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) return;

      const files = fs.readdirSync(logDir);
      let totalBytes = 0;
      for (const f of files) {
        const stat = fs.statSync(path.join(logDir, f));
        totalBytes += stat.size;
      }

      const totalMB = totalBytes / 1024 / 1024;
      if (totalMB > 200) {
        logger.warn('⚠️  Watchdog: log dir large, consider rotation', {
          totalMB: totalMB.toFixed(1),
        });
      }
    } catch {
      // Non-fatal
    }
  }
}

