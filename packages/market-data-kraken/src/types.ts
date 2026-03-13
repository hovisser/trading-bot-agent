import type { Candle, TradeTick } from '@trading-bot/shared-types';

export type KrakenContractPreference = 'perpetual' | 'quarter' | 'semiannual';

export interface KrakenMarket {
  symbol: string;
  marketKey: 'BTCUSD' | 'ETHUSD';
  base: string;
  quote: string;
  contractType?: string;
}

export interface ResolvePrimaryMarketsInput {
  restBaseUrl: string;
  wantedMarkets: Array<'BTCUSD' | 'ETHUSD'>;
  preferredContractTypes?: KrakenContractPreference[];
}

export interface PublicClientOptions {
  wsUrl: string;
  symbols: string[];
}

export interface WarmupCandlesInput {
  chartsBaseUrl: string;
  symbol: string;
  timeframe: '15m' | '1h' | '4h';
  limit: number;
}

export interface PublicClientEvents {
  status: (status: string) => void;
  trade: (trade: TradeTick) => void;
  candle: (candle: Candle) => void;
  raw: (message: unknown) => void;
}
