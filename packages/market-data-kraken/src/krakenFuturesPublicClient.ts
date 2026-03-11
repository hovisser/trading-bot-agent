import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { TradeTick } from '@trading-bot/shared-types';
import { CandleAggregator } from './candleAggregator.js';
import type { PublicClientEvents, PublicClientOptions } from './types.js';

export class KrakenFuturesPublicClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly aggregator = new CandleAggregator();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(private readonly options: PublicClientOptions) {
    super();
  }

  public connect(): void {
    this.ws = new WebSocket(this.options.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', 'connected');
      this.subscribeTrades();
      this.startPing();
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
      this.stopPing();
    });

    this.ws.on('error', (error) => {
      this.emit('status', `error:${error.message}`);
    });
  }

  private subscribeTrades(): void {
    if (!this.ws) return;

    for (const symbol of this.options.symbols) {
      this.ws.send(
        JSON.stringify({
          event: 'subscribe',
          feed: 'trade',
          product_ids: [symbol],
        }),
      );
    }
  }

  private startPing(): void {
    this.stopPing();

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      this.ws.send(JSON.stringify({ event: 'ping' }));
    }, 30_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(message: any): void {
    const feed = message?.feed;

    if (feed !== 'trade') {
      return;
    }

    const symbol = message.product_id ?? message.productId ?? message.symbol;
    const price = Number(message.price);
    const quantity = Number(message.qty ?? message.quantity ?? 0);
    const side = message.side === 'sell' ? 'sell' : 'buy';
    const timestampRaw = message.time ?? message.timestamp ?? Date.now();
    const timestamp =
      typeof timestampRaw === 'number'
        ? timestampRaw
        : Date.parse(timestampRaw);

    if (!symbol || !Number.isFinite(price) || !Number.isFinite(timestamp)) {
      return;
    }

    const trade: TradeTick = {
      exchange: 'kraken',
      symbol,
      price,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      side,
      timestamp,
    };

    this.emit('trade', trade);

    const candle = this.aggregator.updateFromTrade(
      symbol,
      trade.price,
      trade.quantity,
      trade.timestamp,
    );

    this.emit('candle', candle);

    const closedCandles = this.aggregator.markClosedCandles(Date.now());
    for (const closed of closedCandles) {
      this.emit('candle', closed);
    }
  }

  public override on<U extends keyof PublicClientEvents>(
    event: U,
    listener: PublicClientEvents[U],
  ): this {
    return super.on(event, listener);
  }
}
