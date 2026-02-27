# Fart And Furious Server (MVP)

## Runtime requirement

- Node **20+** is required to run the TypeScript sources directly.
- `src/server/index.ts` exits with a clear message on older Node versions.
- MVP rate limiting is in-memory and best-effort (resets on process restart).

## Run server

```bash
node --experimental-strip-types src/server/index.ts
```

## Run tests

```bash
node --experimental-strip-types tests/run_determinism.ts
node --experimental-strip-types tests/run_server_flow.ts
node --experimental-strip-types tests/run_economy_flow.ts
node --experimental-strip-types tests/run_replay_page.ts
node --experimental-strip-types tests/run_hardening.ts
```

## Example API calls

```bash
curl -sS -X POST http://localhost:3000/api/players/guest

curl -sS -X POST http://localhost:3000/api/challenges \
  -H 'content-type: application/json' \
  -d '{"creatureA":{"classKey":"goblin","cosmeticSeed":42}}'

curl -sS -X POST http://localhost:3000/api/challenges/<TOKEN>/accept \
  -H 'content-type: application/json' \
  -d '{"creatureB":{"classKey":"dragon","cosmeticSeed":7}}'

curl -sS -X POST http://localhost:3000/api/matches/<MATCH_ID>/moves \
  -H 'content-type: application/json' \
  -d '{"side":"A","moves":[{"type":"ATTACK","gas":2},{"type":"DEFEND"}]}'

curl -sS -X POST http://localhost:3000/api/replay/<PUBLIC_ID>/share \
  -H 'content-type: application/json' \
  -d '{"playerId":"guest_abc123"}'
```

## Dev reset endpoint

`POST /api/dev/reset` clears all persisted gameplay data (challenges, matches, moves/replays, players/leaderboards, economy events/rivalry data). The endpoint is only available when `NODE_ENV=development`.

If `DEV_RESET_TOKEN` is set, include it via `x-dev-reset-token`.

```bash
curl -sS -X POST http://localhost:3000/api/dev/reset

curl -sS -X POST http://localhost:3000/api/dev/reset \
  -H "x-dev-reset-token: $DEV_RESET_TOKEN"
```
