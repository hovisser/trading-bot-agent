import type { Candle } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';

export interface BreakoutCandidate {
  direction: 'long' | 'short';
  breakoutLevel: number;
  breakoutCandleIndex: number;
  breakoutCandle: Candle;
}

export interface PullbackCandidate {
  direction: 'long' | 'short';
  breakoutLevel: number;
  pullbackCandleIndex: number;
  pullbackCandle: Candle;
}

export interface EntryCandidate {
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  triggerCandleIndex: number;
  triggerCandle: Candle;
}

export interface ScanResult {
  snapshot: StructureSnapshot;
  candidates: import('@trading-bot/shared-types').SetupCandidate[];
}
