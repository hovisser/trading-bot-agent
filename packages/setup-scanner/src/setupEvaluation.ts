import type { Candle } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import type { EvaluatedSetup } from './types.js';
import { classifySetup } from './setupClassification.js';
import { deriveTradeabilityBand, scoreSetup } from './setupScoring.js';

export function evaluateSetup(params: {
  snapshot: StructureSnapshot;
  candles: Candle[];
  direction: 'long' | 'short';
  breakoutLevel: number;
  breakoutCandleIndex: number;
  entryCandleIndex: number;
  entryPrice: number;
  rrEstimate: number;
  htfTrend: 'up' | 'down' | 'neutral';
  tradeableNow: boolean;
  rejectionReason?: string;
}): EvaluatedSetup {
  const breakoutCandle = params.candles[params.breakoutCandleIndex];
  const entryCandle = params.candles[params.entryCandleIndex];

  const setupClass = classifySetup({
    direction: params.direction,
    breakoutLevel: params.breakoutLevel,
    entryPrice: params.entryPrice,
    breakoutCandleIndex: params.breakoutCandleIndex,
    entryCandleIndex: params.entryCandleIndex,
    candles: params.candles,
  });

  const score = scoreSetup({
    snapshot: params.snapshot,
    direction: params.direction,
    breakoutLevel: params.breakoutLevel,
    breakoutCandle,
    entryCandle,
    entryPrice: params.entryPrice,
    rrEstimate: params.rrEstimate,
    htfTrend: params.htfTrend,
    setupClass,
    tradeableNow: params.tradeableNow,
    rejectionReason: params.rejectionReason,
  });

  const tradeability = deriveTradeabilityBand(score.total);

  return {
    setupClass,
    tradeability,
    score,
  };
}
