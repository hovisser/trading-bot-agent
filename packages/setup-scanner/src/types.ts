import type { StructureSnapshot } from '@trading-bot/market-structure';

export type SetupLifecycleState =
  | 'idle'
  | 'breakout_detected'
  | 'waiting_for_pullback'
  | 'entry_ready'
  | 'historical_entry_found'
  | 'candidate_emitted'
  | 'invalidated';

export type RejectionReason =
  | 'trend_mismatch'
  | 'htf_bias_conflict'
  | 'htf_neutral'
  | 'no_breakout'
  | 'pullback_timeout'
  | 'pullback_not_found'
  | 'entry_not_confirmed'
  | 'fresh_rule_failed'
  | 'rr_too_low';

export type SetupClass =
  | 'aggressive_continuation'
  | 'standard_retest'
  | 'deep_pullback'
  | 'late_pullback'
  | 'weak_retest';

export type TradeabilityBand =
  | 'excellent'
  | 'tradeable'
  | 'watchlist'
  | 'reject';

export interface SetupScoreBreakdown {
  total: number;
  htfAlignment: number;
  breakoutQuality: number;
  pullbackQuality: number;
  entryQuality: number;
  zoneQuality: number;
  rrQuality: number;
  freshnessQuality: number;
}

export interface EvaluatedSetup {
  setupClass: SetupClass;
  tradeability: TradeabilityBand;
  score: SetupScoreBreakdown;
}

export interface ScannerTraceEvent {
  symbol: string;
  state: SetupLifecycleState;
  message: string;
  candleIndex?: number;
  direction?: 'long' | 'short';
  rejectionReason?: RejectionReason;
}

export interface StatefulSetupState {
  state: SetupLifecycleState;
  direction: 'long' | 'short';
  breakoutLevel: number;
  breakoutCandleIndex: number;
  expiresAtCandleIndex: number;
}

export interface HistoricalSetupEntry {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  rrEstimate: number;
  targetPrice: number | null;
  detectedAtCandleIndex: number;
  trendContext: 'up' | 'down' | 'neutral';
  tradeableNow: boolean;
  rejectionReason?: RejectionReason;
  setupClass?: SetupClass;
  tradeability?: TradeabilityBand;
  score?: SetupScoreBreakdown;
}

export interface ScanResult {
  snapshot: StructureSnapshot;
  candidates: import('@trading-bot/shared-types').SetupCandidate[];
  historicalEntries: HistoricalSetupEntry[];
  trace: ScannerTraceEvent[];
}
