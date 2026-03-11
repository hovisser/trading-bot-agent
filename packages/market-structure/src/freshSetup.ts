import type { Candle } from '@trading-bot/shared-types';
import type { TradeDirection } from '@trading-bot/shared-types';

export interface FreshSetupCheckInput {
  direction: TradeDirection;
  entryPrice: number;
  candlesAfterSetup: Candle[];
}

export function isFreshSetup(input: FreshSetupCheckInput): boolean {
  const { direction, entryPrice, candlesAfterSetup } = input;

  if (direction === 'long') {
    return !candlesAfterSetup.some((candle) => candle.low < entryPrice);
  }

  return !candlesAfterSetup.some((candle) => candle.high > entryPrice);
}
