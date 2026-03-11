import type { StructurePoint, SwingPoint, TrendDirection } from './types.js';

export function labelStructure(swings: SwingPoint[]): StructurePoint[] {
  const labeled: StructurePoint[] = [];

  let previousHigh: SwingPoint | null = null;
  let previousLow: SwingPoint | null = null;

  for (const swing of swings) {
    if (swing.type === 'high') {
      if (previousHigh) {
        labeled.push({
          ...swing,
          label: swing.price > previousHigh.price ? 'HH' : 'LH',
        });
      }

      previousHigh = swing;
    }

    if (swing.type === 'low') {
      if (previousLow) {
        labeled.push({
          ...swing,
          label: swing.price > previousLow.price ? 'HL' : 'LL',
        });
      }

      previousLow = swing;
    }
  }

  return labeled;
}

export function determineTrend(labeled: StructurePoint[]): TrendDirection {
  const recent = labeled.slice(-6);

  if (recent.length < 4) {
    return 'neutral';
  }

  const highs = recent.filter((x) => x.type === 'high');
  const lows = recent.filter((x) => x.type === 'low');

  const bullishHighs = highs.filter((x) => x.label === 'HH').length;
  const bullishLows = lows.filter((x) => x.label === 'HL').length;
  const bearishHighs = highs.filter((x) => x.label === 'LH').length;
  const bearishLows = lows.filter((x) => x.label === 'LL').length;

  if (bullishHighs >= 2 && bullishLows >= 2) {
    return 'up';
  }

  if (bearishHighs >= 2 && bearishLows >= 2) {
    return 'down';
  }

  return 'neutral';
}
