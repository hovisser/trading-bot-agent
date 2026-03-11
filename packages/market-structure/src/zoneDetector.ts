import type { MarketZone, SwingPoint } from './types.js';

export interface ZoneDetectionOptions {
  paddingPct: number;
  maxZonesPerType: number;
}

export function detectZones(
  swings: SwingPoint[],
  options: ZoneDetectionOptions,
): MarketZone[] {
  const { paddingPct, maxZonesPerType } = options;

  const highs = swings.filter((x) => x.type === 'high').slice(-maxZonesPerType);
  const lows = swings.filter((x) => x.type === 'low').slice(-maxZonesPerType);

  const resistanceZones: MarketZone[] = highs.map((swing) => ({
    type: 'resistance',
    from: swing.price * (1 - paddingPct),
    to: swing.price * (1 + paddingPct),
    sourcePrice: swing.price,
    sourceTimestamp: swing.timestamp,
    timeframe: swing.timeframe,
    symbol: swing.symbol,
  }));

  const supportZones: MarketZone[] = lows.map((swing) => ({
    type: 'support',
    from: swing.price * (1 - paddingPct),
    to: swing.price * (1 + paddingPct),
    sourcePrice: swing.price,
    sourceTimestamp: swing.timestamp,
    timeframe: swing.timeframe,
    symbol: swing.symbol,
  }));

  return [...supportZones, ...resistanceZones].sort(
    (a, b) => a.sourceTimestamp - b.sourceTimestamp,
  );
}
