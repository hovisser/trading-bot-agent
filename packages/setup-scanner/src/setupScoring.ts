import type { Candle } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import type {
  SetupClass,
  SetupScoreBreakdown,
  TradeabilityBand,
} from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreHtfAlignment(params: {
  htfTrend: 'up' | 'down' | 'neutral';
  direction: 'long' | 'short';
}): number {
  const { htfTrend, direction } = params;

  if (htfTrend === 'neutral') {
    return 8;
  }

  if (htfTrend === 'up' && direction === 'long') {
    return 20;
  }

  if (htfTrend === 'down' && direction === 'short') {
    return 20;
  }

  return 0;
}

function scoreBreakoutQuality(params: {
  breakoutCandle: Candle | undefined;
  direction: 'long' | 'short';
  breakoutLevel: number;
}): number {
  const { breakoutCandle, direction, breakoutLevel } = params;

  if (!breakoutCandle) {
    return 0;
  }

  const range = Math.abs(breakoutCandle.high - breakoutCandle.low);

  if (range <= 0) {
    return 0;
  }

  const body = Math.abs(breakoutCandle.close - breakoutCandle.open);
  const bodyStrength = body / range;

  const closeDistance =
    direction === 'long'
      ? breakoutCandle.close - breakoutLevel
      : breakoutLevel - breakoutCandle.close;

  const closeStrength = clamp(closeDistance / range, 0, 1);

  return Math.round(bodyStrength * 9 + closeStrength * 6);
}

function scorePullbackQuality(params: {
  setupClass: SetupClass;
  breakoutLevel: number;
  entryCandle: Candle | undefined;
  direction: 'long' | 'short';
}): number {
  const { setupClass, breakoutLevel, entryCandle, direction } = params;

  if (!entryCandle) {
    return 0;
  }

  let base = 0;

  switch (setupClass) {
    case 'standard_retest':
      base = 18;
      break;
    case 'aggressive_continuation':
      base = 14;
      break;
    case 'deep_pullback':
      base = 12;
      break;
    case 'late_pullback':
      base = 8;
      break;
    case 'weak_retest':
      base = 5;
      break;
  }

  const touchDistance =
    direction === 'long'
      ? Math.abs(entryCandle.low - breakoutLevel)
      : Math.abs(entryCandle.high - breakoutLevel);

  const range = Math.abs(entryCandle.high - entryCandle.low);

  if (range <= 0) {
    return clamp(base - 4, 0, 20);
  }

  const precisionPenalty = clamp((touchDistance / range) * 4, 0, 4);

  return clamp(Math.round(base - precisionPenalty), 0, 20);
}

function scoreEntryQuality(params: {
  entryCandle: Candle | undefined;
  direction: 'long' | 'short';
}): number {
  const { entryCandle, direction } = params;

  if (!entryCandle) {
    return 0;
  }

  const range = Math.abs(entryCandle.high - entryCandle.low);

  if (range <= 0) {
    return 0;
  }

  const body = Math.abs(entryCandle.close - entryCandle.open);
  const bodyStrength = body / range;

  const closeLocation =
    direction === 'long'
      ? (entryCandle.close - entryCandle.low) / range
      : (entryCandle.high - entryCandle.close) / range;

  return clamp(Math.round(bodyStrength * 10 + closeLocation * 5), 0, 15);
}

function scoreZoneQuality(params: {
  snapshot: StructureSnapshot;
  entryPrice: number;
  direction: 'long' | 'short';
}): number {
  const { snapshot, entryPrice, direction } = params;

  const relevantZones = snapshot.zones.filter((zone) =>
    direction === 'long' ? zone.type === 'support' : zone.type === 'resistance',
  );

  if (!relevantZones.length) {
    return 4;
  }

  const nearestDistance = Math.min(
    ...relevantZones.map((zone) => {
      if (entryPrice >= zone.from && entryPrice <= zone.to) {
        return 0;
      }

      return Math.min(
        Math.abs(entryPrice - zone.from),
        Math.abs(entryPrice - zone.to),
      );
    }),
  );

  const avgPrice =
    snapshot.candles.length > 0
      ? snapshot.candles[snapshot.candles.length - 1].close
      : entryPrice;

  const normalized = avgPrice > 0 ? nearestDistance / avgPrice : 1;

  if (normalized <= 0.0005) return 15;
  if (normalized <= 0.001) return 13;
  if (normalized <= 0.002) return 10;
  if (normalized <= 0.003) return 7;

  return 4;
}

function scoreRrQuality(rrEstimate: number): number {
  if (rrEstimate >= 4) return 10;
  if (rrEstimate >= 3) return 9;
  if (rrEstimate >= 2.5) return 8;
  if (rrEstimate >= 2) return 7;
  if (rrEstimate >= 1.5) return 4;

  return 0;
}

function scoreFreshnessQuality(params: {
  tradeableNow: boolean;
  rejectionReason?: string;
}): number {
  const { tradeableNow, rejectionReason } = params;

  if (tradeableNow) {
    return 5;
  }

  if (rejectionReason === 'fresh_rule_failed') {
    return 0;
  }

  return 2;
}

export function deriveTradeabilityBand(total: number): TradeabilityBand {
  if (total >= 80) return 'excellent';
  if (total >= 65) return 'tradeable';
  if (total >= 50) return 'watchlist';

  return 'reject';
}

export function scoreSetup(params: {
  snapshot: StructureSnapshot;
  direction: 'long' | 'short';
  breakoutLevel: number;
  breakoutCandle: Candle | undefined;
  entryCandle: Candle | undefined;
  entryPrice: number;
  rrEstimate: number;
  htfTrend: 'up' | 'down' | 'neutral';
  setupClass: SetupClass;
  tradeableNow: boolean;
  rejectionReason?: string;
}): SetupScoreBreakdown {
  const htfAlignment = scoreHtfAlignment({
    htfTrend: params.htfTrend,
    direction: params.direction,
  });

  const breakoutQuality = scoreBreakoutQuality({
    breakoutCandle: params.breakoutCandle,
    direction: params.direction,
    breakoutLevel: params.breakoutLevel,
  });

  const pullbackQuality = scorePullbackQuality({
    setupClass: params.setupClass,
    breakoutLevel: params.breakoutLevel,
    entryCandle: params.entryCandle,
    direction: params.direction,
  });

  const entryQuality = scoreEntryQuality({
    entryCandle: params.entryCandle,
    direction: params.direction,
  });

  const zoneQuality = scoreZoneQuality({
    snapshot: params.snapshot,
    entryPrice: params.entryPrice,
    direction: params.direction,
  });

  const rrQuality = scoreRrQuality(params.rrEstimate);

  const freshnessQuality = scoreFreshnessQuality({
    tradeableNow: params.tradeableNow,
    rejectionReason: params.rejectionReason,
  });

  const total =
    htfAlignment +
    breakoutQuality +
    pullbackQuality +
    entryQuality +
    zoneQuality +
    rrQuality +
    freshnessQuality;

  return {
    total,
    htfAlignment,
    breakoutQuality,
    pullbackQuality,
    entryQuality,
    zoneQuality,
    rrQuality,
    freshnessQuality,
  };
}
