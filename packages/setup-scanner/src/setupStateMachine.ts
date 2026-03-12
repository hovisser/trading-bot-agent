import { randomUUID } from 'node:crypto';
import type { Candle, SetupCandidate } from '@trading-bot/shared-types';
import { isFreshSetup } from '@trading-bot/market-structure';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import type { BreakoutState } from './types.js';

export interface ReplayScannerOptions {
  strategyId: string;
  minRR: number;
  requireTrendAlignment: boolean;
  timeframe: '15m';
  replayLookbackCandles: number;
  breakoutLookbackCandles: number;
  maxPullbackCandles: number;
  stopBufferPct: number;
}

export function replayForCandidates(
  snapshot: StructureSnapshot,
  options: ReplayScannerOptions,
): SetupCandidate[] {
  const candidates: SetupCandidate[] = [];

  const candles = snapshot.candles.slice(-options.replayLookbackCandles);
  if (candles.length < options.breakoutLookbackCandles + 5) {
    return candidates;
  }

  let state: BreakoutState | null = null;

  for (let i = options.breakoutLookbackCandles; i < candles.length; i++) {
    const current = candles[i];

    if (!state) {
      const breakout = detectBreakoutFromHistory(
        candles,
        i,
        options.breakoutLookbackCandles,
      );

      if (!breakout) {
        continue;
      }

      if (options.requireTrendAlignment) {
        if (breakout.direction === 'long' && snapshot.trend !== 'up') {
          continue;
        }

        if (breakout.direction === 'short' && snapshot.trend !== 'down') {
          continue;
        }
      }

      state = {
        state: 'waiting_for_pullback',
        direction: breakout.direction,
        breakoutLevel: breakout.breakoutLevel,
        breakoutCandleIndex: i,
        breakoutCandle: current,
        expiresAtCandleIndex: i + options.maxPullbackCandles,
      };

      continue;
    }

    if (i > state.expiresAtCandleIndex) {
      state = null;
      continue;
    }

    const entry = detectEntryFromPullback(
      current,
      state,
      options.stopBufferPct,
    );

    if (!entry) {
      continue;
    }

    const candlesAfterSetup = candles.slice(i + 1);

    const freshSetup = isFreshSetup({
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      candlesAfterSetup,
    });

    if (!freshSetup) {
      state = null;
      continue;
    }

    const rrEstimate = estimateRR(
      snapshot,
      entry.direction,
      entry.entryPrice,
      entry.stopLoss,
    );

    if (rrEstimate < options.minRR) {
      state = null;
      continue;
    }

    candidates.push({
      id: randomUUID(),
      strategyId: options.strategyId,
      exchange: 'kraken',
      symbol: snapshot.symbol,
      direction: entry.direction,
      timeframe: options.timeframe,
      detectedAt: Date.now(),
      entryPrice: entry.entryPrice,
      stopLoss: entry.stopLoss,
      htfTrend: snapshot.trend,
      rrEstimate,
      features: [
        'historical_breakout',
        'pullback_detected',
        'elbow_entry',
        'fresh_setup',
      ],
      warnings: [],
      freshSetup: true,
    });

    state = null;
  }

  return dedupeCandidates(candidates);
}

function detectBreakoutFromHistory(
  candles: Candle[],
  index: number,
  lookback: number,
): { direction: 'long' | 'short'; breakoutLevel: number } | null {
  const current = candles[index];
  const previousWindow = candles.slice(index - lookback, index);

  if (!previousWindow.length) {
    return null;
  }

  const previousHigh = Math.max(...previousWindow.map((candle) => candle.high));
  const previousLow = Math.min(...previousWindow.map((candle) => candle.low));

  if (current.close > previousHigh) {
    return {
      direction: 'long',
      breakoutLevel: previousHigh,
    };
  }

  if (current.close < previousLow) {
    return {
      direction: 'short',
      breakoutLevel: previousLow,
    };
  }

  return null;
}

function detectEntryFromPullback(
  candle: Candle,
  state: BreakoutState,
  stopBufferPct: number,
): {
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
} | null {
  const tolerance = state.breakoutLevel * 0.001;

  if (state.direction === 'long') {
    const touchedLevel =
      candle.low <= state.breakoutLevel + tolerance &&
      candle.close >= state.breakoutLevel;

    const bullishConfirmation = candle.close > candle.open;

    if (!touchedLevel || !bullishConfirmation) {
      return null;
    }

    return {
      direction: 'long',
      entryPrice: candle.close,
      stopLoss: candle.low * (1 - stopBufferPct),
    };
  }

  const touchedLevel =
    candle.high >= state.breakoutLevel - tolerance &&
    candle.close <= state.breakoutLevel;

  const bearishConfirmation = candle.close < candle.open;

  if (!touchedLevel || !bearishConfirmation) {
    return null;
  }

  return {
    direction: 'short',
    entryPrice: candle.close,
    stopLoss: candle.high * (1 + stopBufferPct),
  };
}

function estimateRR(
  snapshot: StructureSnapshot,
  direction: 'long' | 'short',
  entryPrice: number,
  stopLoss: number,
): number {
  const risk = Math.abs(entryPrice - stopLoss);

  if (risk <= 0) {
    return 0;
  }

  if (direction === 'long') {
    const nearestResistance = snapshot.zones
      .filter(
        (zone) => zone.type === 'resistance' && zone.sourcePrice > entryPrice,
      )
      .sort((a, b) => a.sourcePrice - b.sourcePrice)[0];

    if (!nearestResistance) {
      return 0;
    }

    return (nearestResistance.sourcePrice - entryPrice) / risk;
  }

  const nearestSupport = snapshot.zones
    .filter((zone) => zone.type === 'support' && zone.sourcePrice < entryPrice)
    .sort((a, b) => b.sourcePrice - a.sourcePrice)[0];

  if (!nearestSupport) {
    return 0;
  }

  return (entryPrice - nearestSupport.sourcePrice) / risk;
}

function dedupeCandidates(candidates: SetupCandidate[]): SetupCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = [
      candidate.symbol,
      candidate.direction,
      candidate.entryPrice.toFixed(2),
      candidate.stopLoss.toFixed(2),
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
