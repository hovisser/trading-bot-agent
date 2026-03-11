import type { Candle, TradeTick } from '@trading-bot/shared-types';

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
}

export interface PublicClientOptions {
  wsUrl: string;
  symbols: string[];
}

export interface PublicClientEvents {
  status: (status: string) => void;
  trade: (trade: TradeTick) => void;
  candle: (candle: Candle) => void;
  raw: (message: unknown) => void;
}
