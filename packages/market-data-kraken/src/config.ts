export interface KrakenConfig {
  restBaseUrl: string;
  wsUrl: string;
}

export function buildKrakenConfig(): KrakenConfig {
  return {
    restBaseUrl:
      process.env.KRAKEN_FUTURES_REST_URL ??
      'https://futures.kraken.com/derivatives/api/v3',
    wsUrl:
      process.env.KRAKEN_FUTURES_WS_URL ?? 'wss://futures.kraken.com/ws/v1',
  };
}
