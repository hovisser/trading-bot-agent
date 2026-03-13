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

export class SetupScanner {
  constructor(private readonly options: SetupScannerOptions) {}

  public scan(snapshot: StructureSnapshot): ScanResult {
    const replay = replayForCandidates(snapshot, {
      strategyId: this.options.strategyId,
      minRR: this.options.minRR,
      requireTrendAlignment: this.options.requireTrendAlignment,
      timeframe: this.options.timeframe,
      replayLookbackCandles: this.options.replayLookbackCandles,
      breakoutLookbackCandles: this.options.breakoutLookbackCandles,
      maxPullbackCandles: this.options.maxPullbackCandles,
      stopBufferPct: this.options.stopBufferPct,
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
