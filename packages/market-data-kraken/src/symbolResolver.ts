import type {
  ResolvePrimaryMarketsInput,
  KrakenMarket,
  KrakenContractPreference,
} from './types.js';

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

function normalizeContractType(tag?: string): KrakenContractPreference | null {
  if (!tag) {
    return null;
  }

  const value = tag.toLowerCase();

  if (value.includes('perpetual')) {
    return 'perpetual';
  }

  if (value.includes('quarter')) {
    return 'quarter';
  }

  if (value.includes('semiannual')) {
    return 'semiannual';
  }

  return null;
}

function scoreContractType(
  tag: string | undefined,
  preferences: KrakenContractPreference[],
): number {
  const normalized = normalizeContractType(tag);

  if (!normalized) {
    return 999;
  }

  const index = preferences.indexOf(normalized);

  return index === -1 ? 999 : index;
}

export async function resolvePrimaryMarkets(
  input: ResolvePrimaryMarketsInput,
): Promise<KrakenMarket[]> {
  const preferences = input.preferredContractTypes ?? [
    'perpetual',
    'quarter',
    'semiannual',
  ];

  const response = await fetch(`${input.restBaseUrl}/tickers`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Kraken futures tickers: ${response.status}`,
    );
  }

  const json = (await response.json()) as TickersResponse;
  const tickers = json.tickers ?? [];

  const grouped = new Map<'BTCUSD' | 'ETHUSD', KrakenMarket[]>();

  for (const ticker of tickers) {
    const symbol = ticker.symbol;
    if (!symbol) {
      continue;
    }

    const marketKey = toMarketKey(symbol);
    if (!marketKey) {
      continue;
    }

    if (!input.wantedMarkets.includes(marketKey)) {
      continue;
    }

    const item: KrakenMarket = {
      symbol,
      marketKey,
      base: marketKey === 'BTCUSD' ? 'BTC' : 'ETH',
      quote: 'USD',
      contractType: ticker.tag,
    };

    const existing = grouped.get(marketKey) ?? [];
    existing.push(item);
    grouped.set(marketKey, existing);
  }

  const resolved: KrakenMarket[] = [];

  for (const wanted of input.wantedMarkets) {
    const candidates = grouped.get(wanted) ?? [];

    if (!candidates.length) {
      throw new Error(
        `Could not resolve any Kraken futures contract for ${wanted}`,
      );
    }

    candidates.sort((a, b) => {
      return (
        scoreContractType(a.contractType, preferences) -
        scoreContractType(b.contractType, preferences)
      );
    });

    resolved.push(candidates[0]);
  }

  return resolved;
}
