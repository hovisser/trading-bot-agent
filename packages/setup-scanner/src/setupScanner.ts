import type { SetupCandidate } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';

import type { HistoricalSetupEntry, ScanResult } from './types.js';
import { replayForCandidates } from './setupStateMachine.js';

export interface SetupScannerOptions {
  strategyId: string;
  minRR: number;
  requireTrendAlignment: boolean;
  timeframe: '15m';
  replayLookbackCandles: number;
  breakoutLookbackCandles: number;
  maxPullbackCandles: number;
  stopBufferPct: number;
}

export interface HtfContextInput {
  trend1h: 'up' | 'down' | 'neutral';
  trend4h: 'up' | 'down' | 'neutral';
}

function deriveAllowedDirection(
  context?: HtfContextInput,
): 'long' | 'short' | null | undefined {
  if (!context) {
    return undefined;
  }

  if (context.trend4h === 'up') {
    if (context.trend1h === 'down') {
      return null;
    }
    return 'long';
  }

  if (context.trend4h === 'down') {
    if (context.trend1h === 'up') {
      return null;
    }
    return 'short';
  }

  // 4h neutral fallback to 1h
  if (context.trend1h === 'up') {
    return 'long';
  }

  if (context.trend1h === 'down') {
    return 'short';
  }

  return null;
}

function deriveHtfTrend(
  context?: HtfContextInput,
): 'up' | 'down' | 'neutral' | undefined {
  if (!context) {
    return undefined;
  }

  if (context.trend4h === 'up' && context.trend1h !== 'down') {
    return 'up';
  }

  if (context.trend4h === 'down' && context.trend1h !== 'up') {
    return 'down';
  }

  if (context.trend4h === 'neutral') {
    if (context.trend1h === 'up') {
      return 'up';
    }

    if (context.trend1h === 'down') {
      return 'down';
    }
  }

  return 'neutral';
}

export class SetupScanner {
  constructor(private readonly options: SetupScannerOptions) {}

  public scan(
    snapshot: StructureSnapshot,
    htfContext?: HtfContextInput,
  ): ScanResult {
    const replay = replayForCandidates(snapshot, {
      strategyId: this.options.strategyId,
      minRR: this.options.minRR,
      requireTrendAlignment: this.options.requireTrendAlignment,
      timeframe: this.options.timeframe,
      replayLookbackCandles: this.options.replayLookbackCandles,
      breakoutLookbackCandles: this.options.breakoutLookbackCandles,
      maxPullbackCandles: this.options.maxPullbackCandles,
      stopBufferPct: this.options.stopBufferPct,
      allowedDirection: deriveAllowedDirection(htfContext),
      htfTrend: deriveHtfTrend(htfContext),
    });

    const candidates: SetupCandidate[] = replay.candidates;
    const historicalEntries: HistoricalSetupEntry[] = replay.historicalEntries;
    const trace = replay.trace;

    return {
      snapshot,
      candidates,
      historicalEntries,
      trace,
    };
  }
}
