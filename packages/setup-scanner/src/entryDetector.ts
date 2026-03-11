import type { EntryCandidate, PullbackCandidate } from './types.js';

export function detectEntry(
  pullback: PullbackCandidate,
): EntryCandidate | null {
  const candle = pullback.pullbackCandle;
  const bufferPct = 0.0003;

  if (pullback.direction === 'long') {
    // bullish confirmation
    if (candle.close <= candle.open) {
      return null;
    }

    return {
      direction: 'long',
      entryPrice: candle.close,
      stopLoss: candle.low * (1 - bufferPct),
      triggerCandleIndex: pullback.pullbackCandleIndex,
      triggerCandle: candle,
    };
  }

  // bearish confirmation
  if (candle.close >= candle.open) {
    return null;
  }

  return {
    direction: 'short',
    entryPrice: candle.close,
    stopLoss: candle.high * (1 + bufferPct),
    triggerCandleIndex: pullback.pullbackCandleIndex,
    triggerCandle: candle,
  };
}
