export type TradeDirection = 'long' | 'short';

export interface PriceZone {
  from: number;
  to: number;
}

export interface SetupCandidate {
  id: string;
  strategyId: string;
  exchange: 'kraken';
  symbol: string;
  direction: TradeDirection;
  timeframe: '15m';
  detectedAt: number;
  entryPrice: number;
  entryZone?: PriceZone;
  stopLoss: number;
  htfTrend: 'up' | 'down' | 'neutral';
  rrEstimate: number;
  features: string[];
  warnings: string[];
  freshSetup: boolean;
  invalidationReason?: string;
}

export interface AiEvaluation {
  setupId: string;
  score: number;
  approved: boolean;
  grade: string;
  reasons: string[];
  warnings: string[];
  createdAt: number;
}
