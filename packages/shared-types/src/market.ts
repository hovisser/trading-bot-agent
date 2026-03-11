export type ExchangeId = 'kraken';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Candle {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export interface TradeTick {
  exchange: ExchangeId;
  symbol: string;
  price: number;
  quantity: number;
  side?: 'buy' | 'sell';
  timestamp: number;
}

export interface Instrument {
  exchange: ExchangeId;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  contractType?: string;
  tickSize?: number;
  contractSize?: number;
}
