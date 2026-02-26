# Testing

Node 20+ is recommended because these scripts rely on `--experimental-strip-types`.

## No-deps test commands

Run these directly with Node (no `npm install` required):

- `node --experimental-strip-types tests/run_determinism.ts`
- `node --experimental-strip-types tests/run_server_flow.ts`
- `node --experimental-strip-types tests/run_economy_flow.ts`
- `node --experimental-strip-types tests/run_replay_page.ts`
- `node --experimental-strip-types tests/run_hardening.ts` (if present)

## Run all zero-deps tests

```bash
./scripts/test-node.sh
```

## Vitest usage

Install dependencies, then run Vitest:

```bash
npm install
npm run test:vitest
```

## Test types

- `run_*.ts` scripts are zero-deps integration tests.
- `*.vitest.ts` files are unit tests that require Vitest.

## Manual web UI flow

1. Start the server:

```bash
node --experimental-strip-types src/server/index.ts
```

2. In browser A, open `http://localhost:3000/` and create a challenge.
3. Copy the generated `/c/<token>` link and open it in browser B.
4. Accept challenge in browser B, then submit moves in both browsers.
5. After both submissions, ensure redirect to `/replay/<publicId>`.
6. Verify the animated log/HP bars run and "Share Page" points to `/r/<publicId>`.
7. Click **I shared this** and confirm profile balances update in top bar on refresh.
