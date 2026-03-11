import type { Candle } from '@trading-bot/shared-types';
import type { SwingPoint } from './types.js';

export interface SwingDetectionOptions {
  lookback: number;
}

export function detectSwings(
  candles: Candle[],
  options: SwingDetectionOptions,
): SwingPoint[] {
  const { lookback } = options;
  const swings: SwingPoint[] = [];

  if (candles.length < lookback * 2 + 1) {
    return swings;
  }

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) {
        continue;
      }

      if (candles[j].high >= current.high) {
        isSwingHigh = false;
      }

      if (candles[j].low <= current.low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swings.push({
        type: 'high',
        price: current.high,
        timestamp: current.closeTime,
        candleIndex: i,
        timeframe: current.timeframe,
        symbol: current.symbol,
      });
    }

    if (isSwingLow) {
      swings.push({
        type: 'low',
        price: current.low,
        timestamp: current.closeTime,
        candleIndex: i,
        timeframe: current.timeframe,
        symbol: current.symbol,
      });
    }
  }

  return swings.sort((a, b) => a.timestamp - b.timestamp);
}
