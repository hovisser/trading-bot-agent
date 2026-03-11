import type { Candle, Timeframe } from '@trading-bot/shared-types';

export type SwingType = 'high' | 'low';
export type StructureLabel = 'HH' | 'HL' | 'LH' | 'LL';
export type TrendDirection = 'up' | 'down' | 'neutral';
export type ZoneType = 'support' | 'resistance';

export interface SwingPoint {
  type: SwingType;
  price: number;
  timestamp: number;
  candleIndex: number;
  timeframe: Timeframe;
  symbol: string;
}

export interface StructurePoint extends SwingPoint {
  label: StructureLabel;
}

export interface MarketZone {
  type: ZoneType;
  from: number;
  to: number;
  sourcePrice: number;
  sourceTimestamp: number;
  timeframe: Timeframe;
  symbol: string;
}

export interface StructureSnapshot {
  symbol: string;
  timeframe: Timeframe;
  trend: TrendDirection;
  candles: Candle[];
  swings: SwingPoint[];
  labeledStructure: StructurePoint[];
  zones: MarketZone[];
}
