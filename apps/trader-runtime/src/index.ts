import 'dotenv/config';
import {
  KrakenFuturesPublicClient,
  buildKrakenConfig,
  resolvePrimaryMarkets,
  warmupCandlesFromTradeHistory,
} from '@trading-bot/market-data-kraken';
import { StructureEngine } from '@trading-bot/market-structure';
import { SetupScanner } from '@trading-bot/setup-scanner';
import {
  defaultScalpStrategy,
  validateScalpStrategy,
} from '@trading-bot/strategy-schemas';
import { logDebug, logError, logInfo, logWarn } from './logger.js';
import { stat } from 'node:fs';

async function bootstrap(): Promise<void> {
  const strategy = validateScalpStrategy(defaultScalpStrategy);
  const config = buildKrakenConfig();

  logInfo('strategy loaded', strategy.id);

  const markets = await resolvePrimaryMarkets({
    restBaseUrl: config.restBaseUrl,
    wantedMarkets: ['BTCUSD', 'ETHUSD'],
    preferredContractTypes: ['perpetual', 'quarter', 'semiannual'],
  });

  logInfo('resolved markets', markets);

  const structureEngine = new StructureEngine({
    maxCandlesPerSeries: 800,
    swingLookback: 2,
    zonePaddingPct: 0.0015,
    maxZonesPerType: 5,
  });

  const scanner = new SetupScanner({
    strategyId: strategy.id,
    minRR: strategy.filters.minRR,
    requireTrendAlignment: strategy.filters.requireTrendAlignment,
    timeframe: '15m',
    replayLookbackCandles: 300,
    breakoutLookbackCandles: 20,
    maxPullbackCandles: 10,
    stopBufferPct: strategy.stopLoss.bufferPct,
  });

  const marketSymbols = markets.map((m) => m.symbol);
  const snapshotCompleted = new Set<string>();

  for (const market of markets) {
    try {
      const candles = await warmupCandlesFromTradeHistory({
        chartsBaseUrl: config.chartsBaseUrl,
        symbol: market.symbol,
        timeframe: '15m',
        limit: 500,
      });

      if (!candles.length) {
        logWarn(`warmup returned no candles for ${market.symbol}`);
        continue;
      }

      for (const candle of candles) {
        structureEngine.pushCandle(candle);
      }

      const snapshot = structureEngine.getSnapshot(market.symbol, '15m');

      logInfo(
        `warmup complete for ${market.symbol}`,
        `candles=${snapshot.candles.length}`,
        `swings=${snapshot.swings.length}`,
        `trend=${snapshot.trend}`,
      );
    } catch (error) {
      logWarn(`warmup failed for ${market.symbol}`, error);
    }
  }

  const client = new KrakenFuturesPublicClient({
    wsUrl: config.wsUrl,
    symbols: marketSymbols,
  });

  client.on('status', (status) => {
    if (status.startsWith('debug')) {
      logDebug(`kraken-status ${status}`);
    } else {
      logInfo(`kraken-status ${status}`);
    }

    if (!status.startsWith('snapshot_complete:')) {
      return;
    }

    const symbol = status.replace('snapshot_complete:', '');
    snapshotCompleted.add(symbol);

    const snapshot = structureEngine.getSnapshot(symbol, '15m');

    logInfo(
      `bootstrap summary for ${symbol}`,
      `candles=${snapshot.candles.length}`,
      `swings=${snapshot.swings.length}`,
      `trend=${snapshot.trend}`,
    );

    logInfo(
      `bootstrap structure for ${symbol}`,
      snapshot.labeledStructure
        .slice(-6)
        .map((x) => `${x.label}@${x.price}`)
        .join(', ') || 'none',
    );

    logInfo(
      `bootstrap zones for ${symbol}`,
      snapshot.zones
        .slice(-4)
        .map((z) => `${z.type}[${z.from.toFixed(2)}-${z.to.toFixed(2)}]`)
        .join(', ') || 'none',
    );

    const bootstrapScanResult = scanner.scan(snapshot);

    for (const traceEvent of bootstrapScanResult.trace.slice(-20)) {
      logDebug(
        `scanner-trace ${traceEvent.symbol}`,
        `state=${traceEvent.state}`,
        traceEvent.direction ? `direction=${traceEvent.direction}` : '',
        traceEvent.rejectionReason
          ? `reason=${traceEvent.rejectionReason}`
          : '',
        traceEvent.message,
      );
    }

    if (bootstrapScanResult.candidates.length === 0) {
      logDebug(`scanner ${symbol} no candidates on bootstrap`);
    }

    for (const candidate of bootstrapScanResult.candidates) {
      logInfo(
        `bootstrap setup candidate ${candidate.symbol} ${candidate.direction}`,
        `entry=${candidate.entryPrice}`,
        `stop=${candidate.stopLoss}`,
        `rr=${candidate.rrEstimate.toFixed(2)}`,
      );
    }
  });

  client.on('trade', (trade) => {
    // too noisy for now, can re-enable if needed for debugging specific issues
    /*logDebug(
      `trade ${trade.symbol} price=${trade.price} qty=${trade.quantity} side=${trade.side ?? 'unknown'}`,
    );*/
  });

  client.on('candle', (candle) => {
    if (!candle.closed) {
      return;
    }

    const snapshot = structureEngine.pushCandle(candle);

    if (!snapshotCompleted.has(candle.symbol)) {
      return;
    }

    const recentStructure = snapshot.labeledStructure.slice(-6);
    const recentZones = snapshot.zones.slice(-4);

    logInfo(
      `structure ${snapshot.symbol} ${snapshot.timeframe} trend=${snapshot.trend}`,
    );

    logInfo(
      'recent structure',
      recentStructure.map((x) => `${x.label}@${x.price}`).join(', ') || 'none',
    );

    logInfo(
      'recent zones',
      recentZones
        .map((z) => `${z.type}[${z.from.toFixed(2)}-${z.to.toFixed(2)}]`)
        .join(', ') || 'none',
    );

    const result = scanner.scan(snapshot);

    for (const traceEvent of result.trace.slice(-12)) {
      logDebug(
        `scanner-trace ${traceEvent.symbol}`,
        `state=${traceEvent.state}`,
        traceEvent.direction ? `direction=${traceEvent.direction}` : '',
        traceEvent.rejectionReason
          ? `reason=${traceEvent.rejectionReason}`
          : '',
        traceEvent.message,
      );
    }

    if (result.candidates.length === 0) {
      logDebug(`scanner ${snapshot.symbol} no candidates`);
    }

    for (const candidate of result.candidates) {
      logInfo(
        `setup candidate ${candidate.symbol} ${candidate.direction}`,
        `entry=${candidate.entryPrice}`,
        `stop=${candidate.stopLoss}`,
        `rr=${candidate.rrEstimate.toFixed(2)}`,
      );
    }
  });

  client.connect();
}

bootstrap().catch((error) => {
  logError('fatal bootstrap error', error);
  process.exit(1);
});
