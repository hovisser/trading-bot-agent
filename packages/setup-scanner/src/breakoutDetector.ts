import type { Candle } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import type { BreakoutCandidate } from './types.js';

export function detectBreakout(
  snapshot: StructureSnapshot,
): BreakoutCandidate | null {
  const candles = snapshot.candles;
  const lastCandle = candles.at(-1);

  if (!lastCandle) {
    return null;
  }

  const recentResistance = snapshot.zones
    .filter((zone) => zone.type === 'resistance')
    .slice(-3)
    .sort((a, b) => b.sourceTimestamp - a.sourceTimestamp)[0];

  const recentSupport = snapshot.zones
    .filter((zone) => zone.type === 'support')
    .slice(-3)
    .sort((a, b) => b.sourceTimestamp - a.sourceTimestamp)[0];

  // breakout long
  if (recentResistance && lastCandle.close > recentResistance.to) {
    return {
      direction: 'long',
      breakoutLevel: recentResistance.to,
      breakoutCandleIndex: candles.length - 1,
      breakoutCandle: lastCandle,
    };
  }

  // breakout short
  if (recentSupport && lastCandle.close < recentSupport.from) {
    return {
      direction: 'short',
      breakoutLevel: recentSupport.from,
      breakoutCandleIndex: candles.length - 1,
      breakoutCandle: lastCandle,
    };
  }

  return null;
}
