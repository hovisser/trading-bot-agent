import { randomUUID } from 'node:crypto';
import type { Candle, SetupCandidate } from '@trading-bot/shared-types';
import { isFreshSetup } from '@trading-bot/market-structure';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import type { ScannerTraceEvent, StatefulSetupState } from './types.js';

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

export interface ReplayScanOutput {
  candidates: SetupCandidate[];
  trace: ScannerTraceEvent[];
}

export function replayForCandidates(
  snapshot: StructureSnapshot,
  options: ReplayScannerOptions,
): ReplayScanOutput {
  const candidates: SetupCandidate[] = [];
  const trace: ScannerTraceEvent[] = [];

  const candles = snapshot.candles.slice(-options.replayLookbackCandles);
  if (candles.length < options.breakoutLookbackCandles + 5) {
    trace.push({
      symbol: snapshot.symbol,
      state: 'idle',
      message: `not enough candles for replay: ${candles.length}`,
      rejectionReason: 'no_breakout',
    });

    return { candidates, trace };
  }

  let state: StatefulSetupState | null = null;
  let breakoutSeen = false;

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

      breakoutSeen = true;

      trace.push({
        symbol: snapshot.symbol,
        state: 'breakout_detected',
        candleIndex: i,
        direction: breakout.direction,
        message: `breakout detected at level=${breakout.breakoutLevel}`,
      });

      if (options.requireTrendAlignment) {
        const hardMismatch =
          (breakout.direction === 'long' && snapshot.trend === 'down') ||
          (breakout.direction === 'short' && snapshot.trend === 'up');

        if (hardMismatch) {
          trace.push({
            symbol: snapshot.symbol,
            state: 'invalidated',
            candleIndex: i,
            direction: breakout.direction,
            message: `trend mismatch for ${breakout.direction}, trend=${snapshot.trend}`,
            rejectionReason: 'trend_mismatch',
          });
          continue;
        }
      }

      state = {
        state: 'waiting_for_pullback',
        direction: breakout.direction,
        breakoutLevel: breakout.breakoutLevel,
        breakoutCandleIndex: i,
        expiresAtCandleIndex: i + options.maxPullbackCandles,
      };

      trace.push({
        symbol: snapshot.symbol,
        state: 'waiting_for_pullback',
        candleIndex: i,
        direction: breakout.direction,
        message: `waiting for pullback until candle ${state.expiresAtCandleIndex}`,
      });

      continue;
    }

    if (i > state.expiresAtCandleIndex) {
      trace.push({
        symbol: snapshot.symbol,
        state: 'invalidated',
        candleIndex: i,
        direction: state.direction,
        message: 'pullback timeout',
        rejectionReason: 'pullback_timeout',
      });

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

    trace.push({
      symbol: snapshot.symbol,
      state: 'entry_ready',
      candleIndex: i,
      direction: entry.direction,
      message: `entry confirmed at ${entry.entryPrice}`,
    });

    trace.push({
      symbol: snapshot.symbol,
      state: 'historical_entry_found',
      candleIndex: i,
      direction: entry.direction,
      message: `historical entry found entry=${entry.entryPrice} stop=${entry.stopLoss}`,
    });

    // Fresh rule: sla de eerstvolgende candle na de entry candle over.
    // Dus pas vanaf i + 2 beoordelen.
    const candlesAfterSetup = candles.slice(i + 2);

    const freshSetup = isFreshSetup({
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      candlesAfterSetup,
    });

    if (!freshSetup) {
      trace.push({
        symbol: snapshot.symbol,
        state: 'invalidated',
        candleIndex: i,
        direction: entry.direction,
        message: 'fresh setup check failed (starting from candle +2)',
        rejectionReason: 'fresh_rule_failed',
      });

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
      trace.push({
        symbol: snapshot.symbol,
        state: 'invalidated',
        candleIndex: i,
        direction: entry.direction,
        message: `rr too low: ${rrEstimate.toFixed(2)}`,
        rejectionReason: 'rr_too_low',
      });

      state = null;
      continue;
    }

    const candidate: SetupCandidate = {
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
    };

    candidates.push(candidate);

    trace.push({
      symbol: snapshot.symbol,
      state: 'candidate_emitted',
      candleIndex: i,
      direction: entry.direction,
      message: `candidate emitted entry=${candidate.entryPrice} stop=${candidate.stopLoss} rr=${candidate.rrEstimate.toFixed(2)}`,
    });

    state = null;
  }

  if (!breakoutSeen) {
    trace.push({
      symbol: snapshot.symbol,
      state: 'idle',
      message: 'no breakout found in replay window',
      rejectionReason: 'no_breakout',
    });
  }

  if (breakoutSeen && candidates.length === 0) {
    trace.push({
      symbol: snapshot.symbol,
      state: 'invalidated',
      message: 'breakouts were found but none produced a valid fresh candidate',
      rejectionReason: 'entry_not_confirmed',
    });
  }

  return {
    candidates: dedupeCandidates(candidates),
    trace,
  };
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

  const candleBody = Math.abs(current.close - current.open);
  const candleRange = Math.abs(current.high - current.low);

  if (candleRange <= 0) {
    return null;
  }

  const bodyStrength = candleBody / candleRange;

  if (current.close > previousHigh && bodyStrength >= 0.4) {
    return {
      direction: 'long',
      breakoutLevel: previousHigh,
    };
  }

  if (current.close < previousLow && bodyStrength >= 0.4) {
    return {
      direction: 'short',
      breakoutLevel: previousLow,
    };
  }

  return null;
}

function detectEntryFromPullback(
  candle: Candle,
  state: StatefulSetupState,
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
