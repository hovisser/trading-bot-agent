import type { Candle, Timeframe } from '@trading-bot/shared-types';
import type { StructureSnapshot } from './types.js';
import { detectSwings } from './swingDetector.js';
import { labelStructure, determineTrend } from './trendAnalyzer.js';
import { detectZones } from './zoneDetector.js';

export interface StructureEngineOptions {
  maxCandlesPerSeries: number;
  swingLookback: number;
  zonePaddingPct: number;
  maxZonesPerType: number;
}

export class StructureEngine {
  private readonly series = new Map<string, Candle[]>();

  constructor(private readonly options: StructureEngineOptions) {}

  public pushCandle(candle: Candle): StructureSnapshot {
    const key = this.getSeriesKey(candle.symbol, candle.timeframe);
    const candles = this.series.get(key) ?? [];

    const existingIndex = candles.findIndex(
      (x) => x.openTime === candle.openTime && x.timeframe === candle.timeframe,
    );

    if (existingIndex >= 0) {
      candles[existingIndex] = candle;
    } else {
      candles.push(candle);
      candles.sort((a, b) => a.openTime - b.openTime);
    }

    const trimmed = candles.slice(-this.options.maxCandlesPerSeries);
    this.series.set(key, trimmed);

    return this.buildSnapshot(candle.symbol, candle.timeframe);
  }

  public getSnapshot(symbol: string, timeframe: Timeframe): StructureSnapshot {
    return this.buildSnapshot(symbol, timeframe);
  }

  private buildSnapshot(
    symbol: string,
    timeframe: Timeframe,
  ): StructureSnapshot {
    const candles = [
      ...(this.series.get(this.getSeriesKey(symbol, timeframe)) ?? []),
    ];
    const swings = detectSwings(candles, {
      lookback: this.options.swingLookback,
    });

    const labeledStructure = labelStructure(swings);
    const trend = determineTrend(labeledStructure);
    const zones = detectZones(swings, {
      paddingPct: this.options.zonePaddingPct,
      maxZonesPerType: this.options.maxZonesPerType,
    });

    return {
      symbol,
      timeframe,
      trend,
      candles,
      swings,
      labeledStructure,
      zones,
    };
  }

  private getSeriesKey(symbol: string, timeframe: Timeframe): string {
    return `${symbol}:${timeframe}`;
  }
}
