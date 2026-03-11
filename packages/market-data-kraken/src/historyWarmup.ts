import type { Candle } from '@trading-bot/shared-types';
import type { WarmupCandlesInput } from './types.js';

type CandleTuple =
  | [number, number, number, number, number]
  | [number, number, number, number, number, number]
  | [number, number, number, number, number, number, number]
  | [string, string, string, string, string]
  | [string, string, string, string, string, string]
  | [string, string, string, string, string, string, string];

type CandleObject = {
  time?: number | string;
  timestamp?: number | string;
  openTime?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string;
};

type CandleLike = CandleTuple | CandleObject;

function timeframeToResolution(timeframe: '15m'): string {
  switch (timeframe) {
    case '15m':
      return '15m';
  }
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

function extractRawCandles(json: unknown): CandleLike[] {
  if (Array.isArray(json)) {
    return json as CandleLike[];
  }

  if (!json || typeof json !== 'object') {
    return [];
  }

  const record = json as Record<string, unknown>;

  const candidates = [
    record.candles,
    record.ohlc,
    record.data,
    record.result,
    record.elements,
    record.rows,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as CandleLike[];
    }
  }

  if (record.result && typeof record.result === 'object') {
    const nested = record.result as Record<string, unknown>;

    const nestedCandidates = [
      nested.candles,
      nested.ohlc,
      nested.data,
      nested.elements,
      nested.rows,
    ];

    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) {
        return candidate as CandleLike[];
      }
    }
  }

  return [];
}

function normalizeCandle(
  symbol: string,
  timeframe: '15m',
  item: CandleLike,
): Candle | null {
  const bucketMs = 15 * 60 * 1000;

  if (Array.isArray(item)) {
    const time = parseTimestamp(item[0]);
    const open = Number(item[1]);
    const high = Number(item[2]);
    const low = Number(item[3]);
    const close = Number(item[4]);
    const volume = Number(item[5] ?? 0);

    if (
      time === null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return null;
    }

    const openTime = Math.floor(time / bucketMs) * bucketMs;
    const closeTime = openTime + bucketMs - 1;

    return {
      exchange: 'kraken',
      symbol,
      timeframe,
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      closed: closeTime < Date.now(),
    };
  }

  const time = parseTimestamp(item.time ?? item.timestamp ?? item.openTime);
  const open = Number(item.open);
  const high = Number(item.high);
  const low = Number(item.low);
  const close = Number(item.close);
  const volume = Number(item.volume ?? 0);

  if (
    time === null ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }

  const openTime = Math.floor(time / bucketMs) * bucketMs;
  const closeTime = openTime + bucketMs - 1;

  return {
    exchange: 'kraken',
    symbol,
    timeframe,
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    closed: closeTime < Date.now(),
  };
}

export async function warmupCandlesFromTradeHistory(
  input: WarmupCandlesInput,
): Promise<Candle[]> {
  const resolution = timeframeToResolution(input.timeframe);
  const url =
    `${input.chartsBaseUrl}/trade/` +
    `${encodeURIComponent(input.symbol)}/` +
    `${encodeURIComponent(resolution)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch chart candles for ${input.symbol}: ${response.status}`,
    );
  }

  const json = await response.json();
  const rawCandles = extractRawCandles(json);

  if (!rawCandles.length) {
    return [];
  }

  const candles = rawCandles
    .map((item) => normalizeCandle(input.symbol, input.timeframe, item))
    .filter((item): item is Candle => item !== null)
    .sort((a, b) => a.openTime - b.openTime);

  // Laat alleen gesloten candles door voor structure warmup
  const closedCandles = candles.filter((candle) => candle.closed);

  return closedCandles.slice(-input.limit);
}
