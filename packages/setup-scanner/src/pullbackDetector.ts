import type { StructureSnapshot } from '@trading-bot/market-structure';
import type { BreakoutCandidate, PullbackCandidate } from './types.js';

export function detectPullback(
  snapshot: StructureSnapshot,
  breakout: BreakoutCandidate,
): PullbackCandidate | null {
  const candles = snapshot.candles;

  if (candles.length < 2) {
    return null;
  }

  const lastCandle = candles.at(-1);
  if (!lastCandle) {
    return null;
  }

  const tolerance = breakout.breakoutLevel * 0.001;

  if (breakout.direction === 'long') {
    const touched =
      lastCandle.low <= breakout.breakoutLevel + tolerance &&
      lastCandle.close >= breakout.breakoutLevel;

    if (!touched) {
      return null;
    }

    return {
      direction: 'long',
      breakoutLevel: breakout.breakoutLevel,
      pullbackCandleIndex: candles.length - 1,
      pullbackCandle: lastCandle,
    };
  }

  const touched =
    lastCandle.high >= breakout.breakoutLevel - tolerance &&
    lastCandle.close <= breakout.breakoutLevel;

  if (!touched) {
    return null;
  }

  return {
    direction: 'short',
    breakoutLevel: breakout.breakoutLevel,
    pullbackCandleIndex: candles.length - 1,
    pullbackCandle: lastCandle,
  };
}
