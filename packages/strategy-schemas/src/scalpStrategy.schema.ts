import { z } from 'zod';

export const scalpStrategySchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean(),
    mode: z.literal('scalp'),
    exchange: z.literal('kraken'),
    symbols: z.array(z.string().min(1)).min(1),
    directions: z.array(z.enum(['long', 'short'])).min(1),
    timeframes: z.object({
      bias: z.tuple([z.literal('4h'), z.literal('1h')]),
      execution: z.literal('15m'),
    }),
    filters: z.object({
      sessionFilter: z.object({
        enabled: z.boolean(),
        allowedSessions: z.array(z.string()),
      }),
      minScore: z.number().min(0).max(100),
      minRR: z.number().positive(),
      requireTrendAlignment: z.boolean(),
    }),
    structure: z.object({
      useHigherTimeframeSR: z.boolean(),
      useTrendStructure: z.boolean(),
      patterns: z.array(z.literal('breakout_pullback')).min(1),
    }),
    entry: z.object({
      type: z.literal('elbow_retest'),
      confirmation: z.literal('close_in_direction'),
      freshSetup: z.object({
        required: z.boolean(),
      }),
    }),
    stopLoss: z.object({
      type: z.literal('candle_extreme_with_buffer'),
      bufferPct: z.number().positive(),
    }),
    risk: z.object({
      maxRiskPct: z.number().positive().max(1),
    }),
    takeProfit: z.object({
      tp1Pct: z.number().min(0).max(100),
      tp2Pct: z.number().min(0).max(100),
      tp3Pct: z.number().min(0).max(100),
      runnerPct: z.number().min(0).max(100),
      moveSlAfterTp1: z.enum([
        'entry_minus_buffer',
        'entry_plus_buffer',
        'entry',
      ]),
      moveSlAfterTp2: z.literal('tp1'),
      runnerTrail: z.enum(['structure', 'atr']),
    }),
  })
  .superRefine((value, ctx) => {
    const total =
      value.takeProfit.tp1Pct +
      value.takeProfit.tp2Pct +
      value.takeProfit.tp3Pct +
      value.takeProfit.runnerPct;

    if (total !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TP percentages + runner percentage must equal 100',
        path: ['takeProfit'],
      });
    }
  });
