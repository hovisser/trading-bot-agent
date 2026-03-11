import type { ScalpStrategyConfig } from '@trading-bot/shared-types';

export const defaultScalpStrategy: ScalpStrategyConfig = {
  id: 'scalp-kraken-v1',
  enabled: true,
  mode: 'scalp',
  exchange: 'kraken',
  symbols: ['BTCUSD', 'ETHUSD'],
  directions: ['long', 'short'],
  timeframes: {
    bias: ['4h', '1h'],
    execution: '15m',
  },
  filters: {
    sessionFilter: {
      enabled: false,
      allowedSessions: [],
    },
    minScore: 70,
    minRR: 2,
    requireTrendAlignment: true,
  },
  structure: {
    useHigherTimeframeSR: true,
    useTrendStructure: true,
    patterns: ['breakout_pullback'],
  },
  entry: {
    type: 'elbow_retest',
    confirmation: 'close_in_direction',
    freshSetup: {
      required: true,
    },
  },
  stopLoss: {
    type: 'candle_extreme_with_buffer',
    bufferPct: 0.0003,
  },
  risk: {
    maxRiskPct: 0.01,
  },
  takeProfit: {
    tp1Pct: 40,
    tp2Pct: 25,
    tp3Pct: 15,
    runnerPct: 20,
    moveSlAfterTp1: 'entry_minus_buffer',
    moveSlAfterTp2: 'tp1',
    runnerTrail: 'structure',
  },
};
