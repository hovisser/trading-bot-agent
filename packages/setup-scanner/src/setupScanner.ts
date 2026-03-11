import { randomUUID } from 'node:crypto';
import type { SetupCandidate } from '@trading-bot/shared-types';
import { isFreshSetup } from '@trading-bot/market-structure';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import { detectBreakout } from './breakoutDetector.js';
import { detectPullback } from './pullbackDetector.js';
import { detectEntry } from './entryDetector.js';
import type { ScanResult } from './types.js';

export interface SetupScannerOptions {
  strategyId: string;
  minRR: number;
  requireTrendAlignment: boolean;
  timeframe: '15m';
}

export class SetupScanner {
  constructor(private readonly options: SetupScannerOptions) {}

  public scan(snapshot: StructureSnapshot): ScanResult {
    const candidates: SetupCandidate[] = [];

    const breakout = detectBreakout(snapshot);

    if (!breakout) {
      return { snapshot, candidates };
    }

    if (this.options.requireTrendAlignment) {
      if (breakout.direction === 'long' && snapshot.trend !== 'up') {
        return { snapshot, candidates };
      }

      if (breakout.direction === 'short' && snapshot.trend !== 'down') {
        return { snapshot, candidates };
      }
    }

    const pullback = detectPullback(snapshot, breakout);

    if (!pullback) {
      return { snapshot, candidates };
    }

    const entry = detectEntry(pullback);

    if (!entry) {
      return { snapshot, candidates };
    }

    const candlesAfterSetup = snapshot.candles.slice(
      entry.triggerCandleIndex + 1,
    );

    const freshSetup = isFreshSetup({
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      candlesAfterSetup,
    });

    if (!freshSetup) {
      return { snapshot, candidates };
    }

    const rrEstimate = this.estimateRR(
      snapshot,
      entry.direction,
      entry.entryPrice,
      entry.stopLoss,
    );

    if (rrEstimate < this.options.minRR) {
      return { snapshot, candidates };
    }

    const candidate: SetupCandidate = {
      id: randomUUID(),
      strategyId: this.options.strategyId,
      exchange: 'kraken',
      symbol: snapshot.symbol,
      direction: entry.direction,
      timeframe: this.options.timeframe,
      detectedAt: Date.now(),
      entryPrice: entry.entryPrice,
      stopLoss: entry.stopLoss,
      htfTrend: snapshot.trend,
      rrEstimate,
      features: [
        'breakout_detected',
        'pullback_detected',
        'elbow_entry',
        'fresh_setup',
      ],
      warnings: [],
      freshSetup: true,
    };

    candidates.push(candidate);

    return { snapshot, candidates };
  }

  private estimateRR(
    snapshot: StructureSnapshot,
    direction: 'long' | 'short',
    entryPrice: number,
    stopLoss: number,
  ): number {
    const risk = Math.abs(entryPrice - stopLoss);

    if (risk <= 0) {
      return 0;
    }

    if (direction === 'long') {
      const nearestResistance = snapshot.zones
        .filter(
          (zone) => zone.type === 'resistance' && zone.sourcePrice > entryPrice,
        )
        .sort((a, b) => a.sourcePrice - b.sourcePrice)[0];

      if (!nearestResistance) {
        return 0;
      }

      const reward = nearestResistance.sourcePrice - entryPrice;
      return reward / risk;
    }

    const nearestSupport = snapshot.zones
      .filter(
        (zone) => zone.type === 'support' && zone.sourcePrice < entryPrice,
      )
      .sort((a, b) => b.sourcePrice - a.sourcePrice)[0];

    if (!nearestSupport) {
      return 0;
    }

    const reward = entryPrice - nearestSupport.sourcePrice;
    return reward / risk;
  }
}
