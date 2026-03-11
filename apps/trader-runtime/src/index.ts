import {
  KrakenFuturesPublicClient,
  buildKrakenConfig,
  resolvePrimaryMarkets,
} from '@trading-bot/market-data-kraken';
import {
  defaultScalpStrategy,
  validateScalpStrategy,
} from '@trading-bot/strategy-schemas';

async function bootstrap(): Promise<void> {
  const strategy = validateScalpStrategy(defaultScalpStrategy);
  const config = buildKrakenConfig();

  console.log('[boot] strategy loaded:', strategy.id);

  const markets = await resolvePrimaryMarkets({
    restBaseUrl: config.restBaseUrl,
    wantedMarkets: ['BTCUSD', 'ETHUSD'],
  });

  console.log('[boot] resolved markets:', markets);

  const client = new KrakenFuturesPublicClient({
    wsUrl: config.wsUrl,
    symbols: markets.map((m) => m.symbol),
  });

  client.on('status', (status) => {
    console.log('[kraken-status]', status);
  });

  client.on('trade', (trade) => {
    console.log('[trade]', trade.symbol, trade.price, trade.quantity);
  });

  client.on('candle', (candle) => {
    if (candle.closed) {
      console.log(
        '[candle-closed]',
        candle.symbol,
        candle.timeframe,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    }
  });

  client.connect();
}

bootstrap().catch((error) => {
  console.error('[fatal]', error);
  process.exit(1);
});
