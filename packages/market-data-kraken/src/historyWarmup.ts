import type { Candle } from '@trading-bot/shared-types';
import { CandleAggregator } from './candleAggregator.js';
import type { WarmupCandlesInput } from './types.js';

interface TradeHistoryResponse {
  history?: {
    elements?: Array<{
      price?: number | string;
      qty?: number | string;
      time?: number | string;
      timestamp?: number | string;
    }>;
  };
  elements?: Array<{
    price?: number | string;
    qty?: number | string;
    time?: number | string;
    timestamp?: number | string;
  }>;
}

function parseTimestamp(value: number | string | undefined): number | null {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const asNumber = Number(value);

    if (Number.isFinite(asNumber)) {
      return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function warmupCandlesFromTradeHistory(
  input: WarmupCandlesInput,
): Promise<Candle[]> {
  const url = `${input.restBaseUrl}/history?symbol=${encodeURIComponent(input.symbol)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch trade history for ${input.symbol}: ${response.status}`,
    );
  }

  const json = (await response.json()) as TradeHistoryResponse;
  const rawTrades = json.history?.elements ?? json.elements ?? [];

  const trades = rawTrades
    .map((item) => {
      const price = Number(item.price);
      const quantity = Number(item.qty ?? 0);
      const timestamp = parseTimestamp(item.time ?? item.timestamp);

      if (
        !Number.isFinite(price) ||
        !Number.isFinite(quantity) ||
        timestamp === null
      ) {
        return null;
      }

      return {
        price,
        quantity,
        timestamp,
      };
    })
    .filter(
      (item): item is { price: number; quantity: number; timestamp: number } =>
        item !== null,
    )
    .slice(-Math.max(input.limit * 50, 500));

  const aggregator = new CandleAggregator();
  const candles = aggregator.buildClosedCandlesFromTrades(input.symbol, trades);

  return candles.slice(-input.limit);
}
