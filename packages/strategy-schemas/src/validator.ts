import { scalpStrategySchema } from './scalpStrategy.schema.js';

export function validateScalpStrategy(input: unknown) {
  return scalpStrategySchema.parse(input);
}
