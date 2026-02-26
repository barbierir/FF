# Testing

Node 20+ is recommended because these scripts rely on `--experimental-strip-types`.

## No-deps test commands

Run these directly with Node (no `npm install` required):

- `node --experimental-strip-types tests/run_determinism.ts`
- `node --experimental-strip-types tests/run_server_flow.ts`
- `node --experimental-strip-types tests/run_economy_flow.ts`
- `node --experimental-strip-types tests/run_replay_page.ts`
- `node --experimental-strip-types tests/run_hardening.ts` (if present)

## Vitest usage

Install dependencies, then run Vitest:

```bash
npm install
npm run test:vitest
```

## Test types

- `run_*.ts` scripts are zero-deps integration tests.
- `*.vitest.ts` files are unit tests that require Vitest.
