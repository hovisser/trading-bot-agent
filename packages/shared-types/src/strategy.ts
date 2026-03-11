export interface SessionFilterConfig {
  enabled: boolean;
  allowedSessions: string[];
}

export interface FreshSetupConfig {
  required: boolean;
}

export interface StopLossConfig {
  type: 'candle_extreme_with_buffer';
  bufferPct: number;
}

export interface TakeProfitConfig {
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  runnerPct: number;
  moveSlAfterTp1: 'entry_minus_buffer' | 'entry_plus_buffer' | 'entry';
  moveSlAfterTp2: 'tp1';
  runnerTrail: 'structure' | 'atr';
}

export interface ScalpStrategyConfig {
  id: string;
  enabled: boolean;
  mode: 'scalp';
  exchange: 'kraken';
  symbols: string[];
  directions: Array<'long' | 'short'>;
  timeframes: {
    bias: ['4h', '1h'];
    execution: '15m';
  };
  filters: {
    sessionFilter: SessionFilterConfig;
    minScore: number;
    minRR: number;
    requireTrendAlignment: boolean;
  };
  structure: {
    useHigherTimeframeSR: boolean;
    useTrendStructure: boolean;
    patterns: Array<'breakout_pullback'>;
  };
  entry: {
    type: 'elbow_retest';
    confirmation: 'close_in_direction';
    freshSetup: FreshSetupConfig;
  };
  stopLoss: StopLossConfig;
  risk: {
    maxRiskPct: number;
  };
  takeProfit: TakeProfitConfig;
}
