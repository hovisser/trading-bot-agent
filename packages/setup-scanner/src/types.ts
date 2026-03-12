import type { Candle } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';

export type ScannerStateType = 'idle' | 'waiting_for_pullback';

export interface BreakoutState {
  state: ScannerStateType;
  direction: 'long' | 'short';
  breakoutLevel: number;
  breakoutCandleIndex: number;
  breakoutCandle: Candle;
  expiresAtCandleIndex: number;
}

export interface ScanResult {
  snapshot: StructureSnapshot;
  candidates: import('@trading-bot/shared-types').SetupCandidate[];
}
