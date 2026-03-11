# Trading Bot

Monorepo voor een price-action trading bot met:

- Node.js + TypeScript runtime
- Kraken market data
- strategy schema's
- later Symfony API + dashboard

## Development

```bash
npm install
npm run dev

''issues

- Kraken historical warmup returns no candles yet
- Kraken trade feed parser may not capture all BTC trades consistently
- Swing/trend logic is v1 and needs refinement before production use
