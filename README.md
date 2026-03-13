# Trading Bot Agent

Monorepo voor een price-action trading bot met:

- Node.js + TypeScript runtime
- Kraken futures market data
- Market structure engine
- Setup scanner
- Later: Symfony API + dashboard

## Huidige status

Werkend:

- Kraken futures symbol resolution voor fase 1
- Warmup via candle charts API
- Live websocket ingest
- Market structure snapshots
- Eerste setup scanner v1

Bekende beperkingen:

- Swing/trend logic is v1 and needs refinement before production use
- Setup scanner is v1 and needs to become more stateful
- AI scoring en risk manager zijn nog niet aangesloten

## Development

```bash
npm install
npm run dev
```

## Docker

docker compose up --build
