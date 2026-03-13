import { randomUUID } from 'node:crypto';

import type { Candle, SetupCandidate } from '@trading-bot/shared-types';
import type { StructureSnapshot } from '@trading-bot/market-structure';
import { isFreshSetup } from '@trading-bot/market-structure';

import type {
  HistoricalSetupEntry,
  ScannerTraceEvent,
  StatefulSetupState,
} from './types.js';

export interface ReplayScannerOptions {
  strategyId: string;
  minRR: number;
  requireTrendAlignment: boolean;
  timeframe: '15m';
  replayLookbackCandles: number;
  breakoutLookbackCandles: number;
  maxPullbackCandles: number;
  stopBufferPct: number;
  allowedDirection?: 'long' | 'short' | null;
  htfTrend?: 'up' | 'down' | 'neutral';
}

export interface ReplayScanOutput {
  candidates: SetupCandidate[];
  historicalEntries: HistoricalSetupEntry[];
  trace: ScannerTraceEvent[];
}

export function replayForCandidates(
  snapshot: StructureSnapshot,
  options: ReplayScannerOptions,
): ReplayScanOutput {
  const candidates: SetupCandidate[] = [];
  const historicalEntries: HistoricalSetupEntry[] = [];
  const trace: ScannerTraceEvent[] = [];

  const candles = snapshot.candles.slice(-options.replayLookbackCandles);

  if (candles.length < options.breakoutLookbackCandles + 5) {
    trace.push({
      symbol: snapshot.symbol,
      state: 'idle',
      message: `not enough candles for replay: ${candles.length}`,
      rejectionReason: 'no_breakout',
    });

    return { candidates, historicalEntries, trace };
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
        if (options.allowedDirection === null) {
          trace.push({
            symbol: snapshot.symbol,
            state: 'invalidated',
            candleIndex: i,
            direction: breakout.direction,
            message: 'htf neutral, skipping setup',
            rejectionReason: 'htf_neutral',
          });

          continue;
        }

        if (
          options.allowedDirection &&
          breakout.direction !== options.allowedDirection
        ) {
          trace.push({
            symbol: snapshot.symbol,
            state: 'invalidated',
            candleIndex: i,
            direction: breakout.direction,
            message: `htf bias conflict for ${breakout.direction}, allowed=${options.allowedDirection}`,
            rejectionReason: 'htf_bias_conflict',
          });

          continue;
        }

        if (!options.allowedDirection) {
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

    const rrProjection = projectTargetAndRR(
      snapshot,
      entry.direction,
      entry.entryPrice,
      entry.stopLoss,
      options.minRR,
    );

    const historicalEntry: HistoricalSetupEntry = {
      symbol: snapshot.symbol,
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      stopLoss: entry.stopLoss,
      rrEstimate: rrProjection.rrEstimate,
      targetPrice: rrProjection.targetPrice,
      detectedAtCandleIndex: i,
      trendContext: options.htfTrend ?? snapshot.trend,
      tradeableNow: false,
    };

    trace.push({
      symbol: snapshot.symbol,
      state: 'historical_entry_found',
      candleIndex: i,
      direction: entry.direction,
      message: `historical entry found entry=${entry.entryPrice} stop=${entry.stopLoss} rr=${rrProjection.rrEstimate.toFixed(2)}`,
    });

    const candlesAfterSetup = candles.slice(i + 2);

    const freshSetup = isFreshSetup({
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      candlesAfterSetup,
    });

    if (!freshSetup) {
      historicalEntry.rejectionReason = 'fresh_rule_failed';
      historicalEntries.push(historicalEntry);

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

    if (rrProjection.rrEstimate < options.minRR) {
      historicalEntry.rejectionReason = 'rr_too_low';
      historicalEntries.push(historicalEntry);

      trace.push({
        symbol: snapshot.symbol,
        state: 'invalidated',
        candleIndex: i,
        direction: entry.direction,
        message: `rr too low: ${rrProjection.rrEstimate.toFixed(2)}`,
        rejectionReason: 'rr_too_low',
      });

      state = null;
      continue;
    }

    historicalEntry.tradeableNow = true;
    historicalEntries.push(historicalEntry);

    const candidateFeatures = [
      'historical_breakout',
      'pullback_detected',
      'elbow_entry',
      'fresh_setup',
    ];

    if (options.allowedDirection) {
      candidateFeatures.push('htf_bias_aligned');
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
      htfTrend: options.htfTrend ?? snapshot.trend,
      rrEstimate: rrProjection.rrEstimate,
      features: candidateFeatures,
      warnings: [],
      freshSetup: true,
    };

    candidates.push(candidate);

    trace.push({
      symbol: snapshot.symbol,
      state: 'candidate_emitted',
      candleIndex: i,
      direction: entry.direction,
      message: `candidate emitted entry=${candidate.entryPrice} stop=${candidate.stopLoss} rr=${candidate.rrEstimate.toFixed(2)} target=${rrProjection.targetPrice ?? 'none'}`,
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
    historicalEntries: dedupeHistoricalEntries(historicalEntries),
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

function projectTargetAndRR(
  snapshot: StructureSnapshot,
  direction: 'long' | 'short',
  entryPrice: number,
  stopLoss: number,
  minRR: number,
): { targetPrice: number | null; rrEstimate: number } {
  const risk = Math.abs(entryPrice - stopLoss);

  if (risk <= 0) {
    return { targetPrice: null, rrEstimate: 0 };
  }

  if (direction === 'long') {
    const targets = snapshot.zones
      .filter(
        (zone) => zone.type === 'resistance' && zone.sourcePrice > entryPrice,
      )
      .map((zone) => zone.sourcePrice)
      .sort((a, b) => a - b);

    if (!targets.length) {
      return { targetPrice: null, rrEstimate: 0 };
    }

    for (const target of targets) {
      const rr = (target - entryPrice) / risk;

      if (rr >= minRR) {
        return {
          targetPrice: target,
          rrEstimate: rr,
        };
      }
    }

    const fallbackTarget = targets[0];

    return {
      targetPrice: fallbackTarget,
      rrEstimate: (fallbackTarget - entryPrice) / risk,
    };
  }

  const targets = snapshot.zones
    .filter((zone) => zone.type === 'support' && zone.sourcePrice < entryPrice)
    .map((zone) => zone.sourcePrice)
    .sort((a, b) => b - a);

  if (!targets.length) {
    return { targetPrice: null, rrEstimate: 0 };
  }

  for (const target of targets) {
    const rr = (entryPrice - target) / risk;

    if (rr >= minRR) {
      return {
        targetPrice: target,
        rrEstimate: rr,
      };
    }
  }

  const fallbackTarget = targets[0];

  return {
    targetPrice: fallbackTarget,
    rrEstimate: (entryPrice - fallbackTarget) / risk,
  };
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

function dedupeHistoricalEntries(
  entries: HistoricalSetupEntry[],
): HistoricalSetupEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = [
      entry.symbol,
      entry.direction,
      entry.entryPrice.toFixed(2),
      entry.stopLoss.toFixed(2),
      entry.tradeableNow ? 'live' : 'historical',
      entry.rejectionReason ?? 'none',
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
