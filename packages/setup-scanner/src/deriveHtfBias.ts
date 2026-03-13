export type Trend = 'up' | 'down' | 'neutral';

export type BiasDirection = 'long' | 'short' | 'neutral';

export interface HtfBias {
  direction: BiasDirection;

  confidence: number;

  reason: string[];
}

export function deriveHtfBias(
  trend4h: Trend,

  trend1h: Trend,

  trend15m: Trend,
): HtfBias {
  if (trend4h === 'up') {
    if (trend1h === 'down') {
      return {
        direction: 'neutral',

        confidence: 0.3,

        reason: ['4h_up', '1h_conflict'],
      };
    }

    return {
      direction: 'long',

      confidence: trend1h === 'up' ? 0.9 : 0.7,

      reason: ['4h_up', trend1h === 'up' ? '1h_confirm' : '1h_neutral'],
    };
  }

  if (trend4h === 'down') {
    if (trend1h === 'up') {
      return {
        direction: 'neutral',

        confidence: 0.3,

        reason: ['4h_down', '1h_conflict'],
      };
    }

    return {
      direction: 'short',

      confidence: trend1h === 'down' ? 0.9 : 0.7,

      reason: ['4h_down', trend1h === 'down' ? '1h_confirm' : '1h_neutral'],
    };
  }

  return {
    direction: 'neutral',

    confidence: 0.2,

    reason: ['4h_neutral'],
  };
}
