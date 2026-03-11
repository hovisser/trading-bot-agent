export type TradeState =
  | 'candidate'
  | 'approved'
  | 'rejected'
  | 'entry_submitted'
  | 'partially_filled'
  | 'filled'
  | 'tp1_hit'
  | 'tp2_hit'
  | 'tp3_hit'
  | 'runner'
  | 'closed'
  | 'cancelled';

export interface TakeProfitTarget {
  label: 'tp1' | 'tp2' | 'tp3';
  price: number;
  percentage: number;
}

export interface ManagedTrade {
  id: string;
  setupId: string;
  state: TradeState;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfits: TakeProfitTarget[];
  runnerPercentage: number;
  createdAt: number;
}
