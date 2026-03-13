import type { Candle, Timeframe } from '@trading-bot/shared-types';

type SupportedTimeframe = '15m' | '1h' | '4h';

function timeframeToMs(timeframe: SupportedTimeframe): number {
  switch (timeframe) {
    case '15m':
      return 15 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
  }
}

export class CandleAggregator {
  private candles = new Map<string, Candle>();

  constructor(private readonly timeframe: SupportedTimeframe = '15m') {}

  public updateFromTrade(
    symbol: string,
    price: number,
    quantity: number,
    timestamp: number,
  ): Candle {
    const bucketSize = timeframeToMs(this.timeframe);
    const openTime = Math.floor(timestamp / bucketSize) * bucketSize;
    const closeTime = openTime + bucketSize - 1;
    const key = `${symbol}:${this.timeframe}:${openTime}`;

    const existing = this.candles.get(key);

    if (!existing) {
      const candle: Candle = {
        exchange: 'kraken',
        symbol,
        timeframe: this.timeframe as Timeframe,
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

  public buildClosedCandlesFromTrades(
    symbol: string,
    trades: Array<{ price: number; quantity: number; timestamp: number }>,
  ): Candle[] {
    this.resetSymbol(symbol);

    for (const trade of trades) {
      this.updateFromTrade(
        symbol,
        trade.price,
        trade.quantity,
        trade.timestamp,
      );
    }

    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const closed = this.markClosedCandles(farFuture);

    return closed.sort((a, b) => a.openTime - b.openTime);
  }

  private resetSymbol(symbol: string): void {
    for (const key of this.candles.keys()) {
      if (key.startsWith(`${symbol}:`)) {
        this.candles.delete(key);
      }
    }
  }
}
