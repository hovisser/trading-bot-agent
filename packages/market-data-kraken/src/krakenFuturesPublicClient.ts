import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { TradeTick } from '@trading-bot/shared-types';
import { CandleAggregator } from './candleAggregator.js';
import type { PublicClientEvents, PublicClientOptions } from './types.js';

export class KrakenFuturesPublicClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly aggregator = new CandleAggregator();

  constructor(private readonly options: PublicClientOptions) {
    super();
  }

  public connect(): void {
    this.ws = new WebSocket(this.options.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', 'connected');
      this.subscribeTrades();
    });

    this.ws.on('message', (data) => {
      const text = data.toString();

      try {
        const message = JSON.parse(text);
        this.emit('raw', message);
        this.handleMessage(message);
      } catch (error) {
        this.emit('status', `parse_error:${(error as Error).message}`);
      }
    });

    this.ws.on('close', () => {
      this.emit('status', 'closed');
    });

    this.ws.on('error', (error) => {
      this.emit('status', `error:${error.message}`);
    });
  }

  private subscribeTrades(): void {
    if (!this.ws) {
      return;
    }

    for (const symbol of this.options.symbols) {
      this.emit('status', `subscribing trade feed for ${symbol}`);

      this.ws.send(
        JSON.stringify({
          event: 'subscribe',
          feed: 'trade',
          product_ids: [symbol],
        }),
      );
    }
  }

  private handleMessage(message: any): void {
    if (message?.event === 'alert') {
      this.emit('status', `alert:${message.message}`);
      return;
    }

    if (message?.event === 'subscribed') {
      this.emit(
        'status',
        `subscribed:${message.feed ?? 'unknown'}:${message.product_ids?.join(',') ?? ''}`,
      );
      return;
    }

    if (message?.event === 'info') {
      this.emit('status', `info:${JSON.stringify(message)}`);
      return;
    }

    const feed = message?.feed;

    if (feed === 'trade_snapshot') {
      this.handleTradeSnapshotMessage(message);
      return;
    }

    if (feed === 'trade') {
      this.handleTradeFeedMessage(message);
      return;
    }
  }

  private handleTradeSnapshotMessage(message: any): void {
    const symbol = message.product_id ?? message.productId ?? message.symbol;

    if (!symbol || typeof symbol !== 'string') {
      return;
    }

    if (!Array.isArray(message.trades)) {
      return;
    }

    this.emit(
      'status',
      `trade_snapshot:${symbol}:count=${message.trades.length}`,
    );

    for (const item of message.trades) {
      const nestedSymbol =
        item?.product_id ?? item?.productId ?? item?.symbol ?? symbol;

      const trade = this.normalizeTrade(nestedSymbol, item);

      if (!trade) {
        continue;
      }

      this.aggregator.updateFromTrade(
        trade.symbol,
        trade.price,
        trade.quantity,
        trade.timestamp,
      );
    }

    this.flushClosedCandles();
  }

  private handleTradeFeedMessage(message: any): void {
    const symbol = message.product_id ?? message.productId ?? message.symbol;

    if (!symbol || typeof symbol !== 'string') {
      return;
    }

    if (Array.isArray(message.trades)) {
      for (const item of message.trades) {
        const nestedSymbol =
          item?.product_id ?? item?.productId ?? item?.symbol ?? symbol;

        const trade = this.normalizeTrade(nestedSymbol, item);

        if (!trade) {
          continue;
        }

        this.emitTrade(trade);
      }

      this.flushClosedCandles();
      return;
    }

    const trade = this.normalizeTrade(symbol, message);

    if (!trade) {
      return;
    }

    this.emitTrade(trade);
    this.flushClosedCandles();
  }

  private normalizeTrade(symbol: string, source: any): TradeTick | null {
    const price = Number(source?.price);
    const quantity = Number(source?.qty ?? source?.quantity ?? 0);
    const timestamp = this.parseTimestamp(
      source?.time ?? source?.timestamp ?? Date.now(),
    );

    if (!Number.isFinite(price) || !Number.isFinite(timestamp)) {
      return null;
    }

    const side =
      source?.side === 'sell'
        ? 'sell'
        : source?.side === 'buy'
          ? 'buy'
          : undefined;

    return {
      exchange: 'kraken',
      symbol,
      price,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      side,
      timestamp,
    };
  }

  private emitTrade(trade: TradeTick): void {
    this.emit('trade', trade);

    const candle = this.aggregator.updateFromTrade(
      trade.symbol,
      trade.price,
      trade.quantity,
      trade.timestamp,
    );

    this.emit('candle', candle);
  }

  private flushClosedCandles(): void {
    const closedCandles = this.aggregator.markClosedCandles(Date.now());

    for (const closed of closedCandles) {
      this.emit('candle', closed);
    }
  }

  private parseTimestamp(value: unknown): number {
    if (typeof value === 'number') {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }

    if (typeof value === 'string') {
      const asNumber = Number(value);

      if (Number.isFinite(asNumber)) {
        return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
      }

      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : Date.now();
    }

    return Date.now();
  }

  public override on<U extends keyof PublicClientEvents>(
    event: U,
    listener: PublicClientEvents[U],
  ): this {
    return super.on(event, listener);
  }
}
