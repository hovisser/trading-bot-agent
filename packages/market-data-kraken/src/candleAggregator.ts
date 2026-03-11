import type { Candle } from '@trading-bot/shared-types';

function timeframeToMs(timeframe: '15m'): number {
  return 15 * 60 * 1000;
}

export class CandleAggregator {
  private candles = new Map<string, Candle>();

  public updateFromTrade(
    symbol: string,
    price: number,
    quantity: number,
    timestamp: number,
  ): Candle {
    const timeframe = '15m';
    const bucketSize = timeframeToMs(timeframe);
    const openTime = Math.floor(timestamp / bucketSize) * bucketSize;
    const closeTime = openTime + bucketSize - 1;
    const key = `${symbol}:${timeframe}:${openTime}`;

    const existing = this.candles.get(key);

    if (!existing) {
      const candle: Candle = {
        exchange: 'kraken',
        symbol,
        timeframe,
        openTime,
        closeTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        closed: false,
      };

      this.candles.set(key, candle);
      return candle;
    }

    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += quantity;

    return existing;
  }

  public markClosedCandles(now: number): Candle[] {
    const closed: Candle[] = [];

    for (const candle of this.candles.values()) {
      if (!candle.closed && now > candle.closeTime) {
        candle.closed = true;
        closed.push({ ...candle });
      }
    }

    return closed;
  }
}
