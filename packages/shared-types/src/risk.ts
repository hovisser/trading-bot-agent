export interface PositionSizingInput {
  accountBalance: number;
  riskPct: number;
  entryPrice: number;
  stopLoss: number;
}

export interface PositionSizingResult {
  riskAmount: number;
  stopDistance: number;
  quantity: number;
  effectiveRiskPct: number;
}
