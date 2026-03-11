import type { ResolvePrimaryMarketsInput, KrakenMarket } from './types.js';

interface TickersResponse {
  tickers?: Array<{
    symbol?: string;
    tag?: string;
  }>;
}

function toMarketKey(symbol: string): 'BTCUSD' | 'ETHUSD' | null {
  const upper = symbol.toUpperCase();

  if (upper.includes('XBTUSD') || upper.includes('BTCUSD')) {
    return 'BTCUSD';
  }

  if (upper.includes('ETHUSD')) {
    return 'ETHUSD';
  }

  return null;
}

export async function resolvePrimaryMarkets(
  input: ResolvePrimaryMarketsInput,
): Promise<KrakenMarket[]> {
  const response = await fetch(`${input.restBaseUrl}/tickers`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Kraken futures tickers: ${response.status}`,
    );
  }

  const json = (await response.json()) as TickersResponse;
  const tickers = json.tickers ?? [];

  const wanted = new Set(input.wantedMarkets);
  const resolved = new Map<'BTCUSD' | 'ETHUSD', KrakenMarket>();

  for (const ticker of tickers) {
    const symbol = ticker.symbol;
    if (!symbol) continue;

    const marketKey = toMarketKey(symbol);
    if (!marketKey) continue;
    if (!wanted.has(marketKey)) continue;
    if (resolved.has(marketKey)) continue;

    resolved.set(marketKey, {
      symbol,
      marketKey,
      base: marketKey.startsWith('BTC') ? 'BTC' : 'ETH',
      quote: 'USD',
      contractType: ticker.tag,
    });
  }

  const result = Array.from(resolved.values());

  if (result.length !== input.wantedMarkets.length) {
    throw new Error(
      `Could not resolve all wanted Kraken markets. Resolved=${result.map((x) => x.symbol).join(', ')}`,
    );
  }

  return result;
}
