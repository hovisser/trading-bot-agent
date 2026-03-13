import type { Candle } from '@trading-bot/shared-types';
import type { SetupClass } from './types.js';

export function classifySetup(params: {
  direction: 'long' | 'short';
  breakoutLevel: number;
  entryPrice: number;
  breakoutCandleIndex: number;
  entryCandleIndex: number;
  candles: Candle[];
}): SetupClass {
  const {
    direction,
    breakoutLevel,
    breakoutCandleIndex,
    entryCandleIndex,
    candles,
  } = params;

  const breakoutCandle = candles[breakoutCandleIndex];
  const entryCandle = candles[entryCandleIndex];

  if (!breakoutCandle || !entryCandle) {
    return 'weak_retest';
  }

  const barsSinceBreakout = entryCandleIndex - breakoutCandleIndex;
  const breakoutRange = Math.abs(breakoutCandle.high - breakoutCandle.low);

  if (breakoutRange <= 0) {
    return 'weak_retest';
  }

  const moveAway =
    direction === 'long'
      ? breakoutCandle.close - breakoutLevel
      : breakoutLevel - breakoutCandle.close;

  const retestDepth =
    direction === 'long'
      ? breakoutLevel - entryCandle.low
      : entryCandle.high - breakoutLevel;

  const normalizedMoveAway = moveAway / breakoutRange;
  const normalizedRetestDepth = Math.abs(retestDepth) / breakoutRange;

  if (barsSinceBreakout <= 2 && normalizedRetestDepth < 0.35) {
    return 'aggressive_continuation';
  }

  if (barsSinceBreakout <= 6 && normalizedRetestDepth <= 1.0) {
    return 'standard_retest';
  }

  if (barsSinceBreakout <= 10 && normalizedRetestDepth > 1.0) {
    return 'deep_pullback';
  }

  if (barsSinceBreakout > 10) {
    return 'late_pullback';
  }

  if (normalizedMoveAway < 0.2) {
    return 'weak_retest';
  }

  return 'standard_retest';
}
