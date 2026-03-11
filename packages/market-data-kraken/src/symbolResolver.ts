import type {
  ResolvePrimaryMarketsInput,
  KrakenMarket,
  KrakenContractPreference,
} from './types.js';

interface TickerItem {
  symbol?: string;
  tag?: string;
  last?: number | string;
  markPrice?: number | string;
  indexPrice?: number | string;
}

interface TickersResponse {
  tickers?: TickerItem[];
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

  if (value.includes('month')) {
    return 'quarter';
  }

  if (value.includes('week')) {
    return 'quarter';
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

function extractReferencePrice(ticker: TickerItem): number | null {
  const candidates = [ticker.markPrice, ticker.indexPrice, ticker.last];

  for (const candidate of candidates) {
    const value = Number(candidate);

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function passesPriceSanity(
  marketKey: 'BTCUSD' | 'ETHUSD',
  price: number | null,
): boolean {
  if (price === null) {
    return true;
  }

  if (marketKey === 'BTCUSD') {
    return price > 1_000;
  }

  if (marketKey === 'ETHUSD') {
    return price > 100;
  }

  return true;
}

function symbolNameScore(
  marketKey: 'BTCUSD' | 'ETHUSD',
  symbol: string,
): number {
  const upper = symbol.toUpperCase();

  if (marketKey === 'BTCUSD') {
    if (upper === 'PF_XBTUSD') return 0;
    if (upper === 'PI_XBTUSD') return 1;
    if (upper === 'PF_BTCUSD') return 2;
    if (upper === 'PI_BTCUSD') return 3;

    if (upper.includes('PF_XBTUSD')) return 5;
    if (upper.includes('PI_XBTUSD')) return 6;
    if (upper.includes('PF_BTCUSD')) return 7;
    if (upper.includes('PI_BTCUSD')) return 8;

    if (upper.includes('XBTUSD')) return 20;
    if (upper.includes('BTCUSD')) return 25;

    return 999;
  }

  if (marketKey === 'ETHUSD') {
    if (upper === 'PF_ETHUSD') return 0;
    if (upper === 'PI_ETHUSD') return 1;

    if (upper.includes('PF_ETHUSD')) return 5;
    if (upper.includes('PI_ETHUSD')) return 6;

    if (upper.includes('ETHUSD')) return 20;

    return 999;
  }

  return 999;
}

function buildBaseAsset(marketKey: 'BTCUSD' | 'ETHUSD'): string {
  return marketKey === 'BTCUSD' ? 'BTC' : 'ETH';
}

function getPhaseOnePreferredSymbol(marketKey: 'BTCUSD' | 'ETHUSD'): string {
  if (marketKey === 'BTCUSD') {
    return 'PF_XBTUSD';
  }

  return 'PF_ETHUSD';
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

    const referencePrice = extractReferencePrice(ticker);

    if (!passesPriceSanity(marketKey, referencePrice)) {
      continue;
    }

    const candidate: KrakenMarket = {
      symbol,
      marketKey,
      base: buildBaseAsset(marketKey),
      quote: 'USD',
      contractType: ticker.tag,
    };

    const existing = grouped.get(marketKey) ?? [];
    existing.push(candidate);
    grouped.set(marketKey, existing);
  }

  const resolved: KrakenMarket[] = [];

  for (const wanted of input.wantedMarkets) {
    const candidates = grouped.get(wanted) ?? [];

    if (!candidates.length) {
      throw new Error(
        `Could not resolve any sane Kraken futures contract for ${wanted}`,
      );
    }

    const preferredSymbol = getPhaseOnePreferredSymbol(wanted);
    const exactPreferred = candidates.find(
      (candidate) => candidate.symbol.toUpperCase() === preferredSymbol,
    );

    if (exactPreferred) {
      resolved.push(exactPreferred);
      continue;
    }

    candidates.sort((a, b) => {
      const contractScoreDiff =
        scoreContractType(a.contractType, preferences) -
        scoreContractType(b.contractType, preferences);

      if (contractScoreDiff !== 0) {
        return contractScoreDiff;
      }

      const symbolScoreDiff =
        symbolNameScore(wanted, a.symbol) - symbolNameScore(wanted, b.symbol);

      if (symbolScoreDiff !== 0) {
        return symbolScoreDiff;
      }

      return a.symbol.localeCompare(b.symbol);
    });

    resolved.push(candidates[0]);
  }

  return resolved;
}
