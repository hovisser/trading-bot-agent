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

type TrendDirection = 'up' | 'down' | 'neutral';
type WarmupTimeframe = '15m' | '1h' | '4h';

function deriveMtfBias(
  trend4h: TrendDirection,
  trend1h: TrendDirection,
): {
  allowedDirection: 'long' | 'short' | null;
  htfTrend: TrendDirection;
  reason: string;
} {
  if (trend4h === 'up') {
    if (trend1h === 'down') {
      return {
        allowedDirection: null,
        htfTrend: 'neutral',
        reason: '4h_up_1h_conflict',
      };
    }

    return {
      allowedDirection: 'long',
      htfTrend: 'up',
      reason: trend1h === 'up' ? '4h_up_1h_confirm' : '4h_up_1h_neutral',
    };
  }

  if (trend4h === 'down') {
    if (trend1h === 'up') {
      return {
        allowedDirection: null,
        htfTrend: 'neutral',
        reason: '4h_down_1h_conflict',
      };
    }

    return {
      allowedDirection: 'short',
      htfTrend: 'down',
      reason: trend1h === 'down' ? '4h_down_1h_confirm' : '4h_down_1h_neutral',
    };
  }

  return {
    allowedDirection: null,
    htfTrend: 'neutral',
    reason: '4h_neutral',
  };
}

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

  const warmupPlan: Array<{ timeframe: WarmupTimeframe; limit: number }> = [
    { timeframe: '15m', limit: 500 },
    { timeframe: '1h', limit: 300 },
    { timeframe: '4h', limit: 200 },
  ];

  for (const market of markets) {
    for (const plan of warmupPlan) {
      try {
        const candles = await warmupCandlesFromTradeHistory({
          chartsBaseUrl: config.chartsBaseUrl,
          symbol: market.symbol,
          timeframe: plan.timeframe,
          limit: plan.limit,
        });

        if (!candles.length) {
          logWarn(
            `warmup returned no candles for ${market.symbol} ${plan.timeframe}`,
          );
          continue;
        }

        for (const candle of candles) {
          structureEngine.pushCandle(candle);
        }

        const snapshot = structureEngine.getSnapshot(
          market.symbol,
          plan.timeframe,
        );

        logInfo(
          `warmup complete for ${market.symbol} ${plan.timeframe}`,
          `candles=${snapshot.candles.length}`,
          `swings=${snapshot.swings.length}`,
          `trend=${snapshot.trend}`,
        );
      } catch (error) {
        logWarn(`warmup failed for ${market.symbol} ${plan.timeframe}`, error);
      }
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

    const snapshot15m = structureEngine.getSnapshot(symbol, '15m');
    const snapshot1h = structureEngine.getSnapshot(symbol, '1h');
    const snapshot4h = structureEngine.getSnapshot(symbol, '4h');

    const mtfBias = deriveMtfBias(snapshot4h.trend, snapshot1h.trend);

    logInfo(
      `bootstrap summary for ${symbol}`,
      `15m candles=${snapshot15m.candles.length}`,
      `15m swings=${snapshot15m.swings.length}`,
      `15m trend=${snapshot15m.trend}`,
    );

    logInfo(
      `bootstrap htf for ${symbol}`,
      `1h trend=${snapshot1h.trend}`,
      `4h trend=${snapshot4h.trend}`,
      `bias=${mtfBias.allowedDirection ?? 'neutral'}`,
      `reason=${mtfBias.reason}`,
    );

    logInfo(
      `bootstrap structure for ${symbol}`,
      snapshot15m.labeledStructure
        .slice(-6)
        .map((x) => `${x.label}@${x.price}`)
        .join(', ') || 'none',
    );

    logInfo(
      `bootstrap zones for ${symbol}`,
      snapshot15m.zones
        .slice(-4)
        .map((z) => `${z.type}[${z.from.toFixed(2)}-${z.to.toFixed(2)}]`)
        .join(', ') || 'none',
    );

    const bootstrapScanResult = scanner.scan(snapshot15m, {
      trend1h: snapshot1h.trend,
      trend4h: snapshot4h.trend,
    });

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

    for (const historicalEntry of bootstrapScanResult.historicalEntries.slice(
      -10,
    )) {
      logDebug(
        `historical-entry ${historicalEntry.symbol}`,
        `direction=${historicalEntry.direction}`,
        `entry=${historicalEntry.entryPrice}`,
        `stop=${historicalEntry.stopLoss}`,
        `rr=${historicalEntry.rrEstimate.toFixed(2)}`,
        `target=${historicalEntry.targetPrice ?? 'none'}`,
        `tradeableNow=${historicalEntry.tradeableNow}`,
        historicalEntry.rejectionReason
          ? `reason=${historicalEntry.rejectionReason}`
          : '',
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

  client.on('trade', (_trade) => {
    // too noisy for now
  });

  client.on('candle', (candle) => {
    if (!candle.closed) {
      return;
    }

    const snapshot = structureEngine.pushCandle(candle);

    if (!snapshotCompleted.has(candle.symbol)) {
      return;
    }

    if (snapshot.timeframe !== '15m') {
      logInfo(
        `structure ${snapshot.symbol} ${snapshot.timeframe} trend=${snapshot.trend}`,
      );
      return;
    }

    const snapshot1h = structureEngine.getSnapshot(snapshot.symbol, '1h');
    const snapshot4h = structureEngine.getSnapshot(snapshot.symbol, '4h');
    const mtfBias = deriveMtfBias(snapshot4h.trend, snapshot1h.trend);

    const recentStructure = snapshot.labeledStructure.slice(-6);
    const recentZones = snapshot.zones.slice(-4);

    logInfo(
      `structure ${snapshot.symbol} ${snapshot.timeframe} trend=${snapshot.trend}`,
    );

    logInfo(
      `mtf-context ${snapshot.symbol}`,
      `4h=${snapshot4h.trend}`,
      `1h=${snapshot1h.trend}`,
      `15m=${snapshot.trend}`,
      `bias=${mtfBias.allowedDirection ?? 'neutral'}`,
      `reason=${mtfBias.reason}`,
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

    const result = scanner.scan(snapshot, {
      trend1h: snapshot1h.trend,
      trend4h: snapshot4h.trend,
    });

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

    for (const historicalEntry of result.historicalEntries.slice(-5)) {
      logDebug(
        `historical-entry ${historicalEntry.symbol}`,
        `direction=${historicalEntry.direction}`,
        `entry=${historicalEntry.entryPrice}`,
        `stop=${historicalEntry.stopLoss}`,
        `rr=${historicalEntry.rrEstimate.toFixed(2)}`,
        `target=${historicalEntry.targetPrice ?? 'none'}`,
        `tradeableNow=${historicalEntry.tradeableNow}`,
        historicalEntry.rejectionReason
          ? `reason=${historicalEntry.rejectionReason}`
          : '',
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
        `htfTrend=${candidate.htfTrend}`,
      );
    }
  });

  client.connect();
}

bootstrap().catch((error) => {
  logError('fatal bootstrap error', error);
  process.exit(1);
});
