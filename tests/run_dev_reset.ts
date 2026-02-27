import { rm } from "node:fs/promises";
import path from "node:path";

process.env.NODE_ENV = "development";

const dataDir = path.resolve(process.cwd(), "data", "faf");
await rm(dataDir, { recursive: true, force: true });

const { createApiServer } = await import("../src/server/index.ts");

async function main(): Promise<void> {
  const server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createResp = await fetch(`${baseUrl}/api/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatureA: { classKey: "goblin", cosmeticSeed: 123 }, playerId: "reset_tester_a" }),
    });
    if (!createResp.ok) throw new Error(`create failed: ${createResp.status}`);
    const created = (await createResp.json()) as { token: string };

    const acceptResp = await fetch(`${baseUrl}/api/challenges/${encodeURIComponent(created.token)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatureB: { classKey: "dragon", cosmeticSeed: 456 }, playerId: "reset_tester_b" }),
    });
    if (!acceptResp.ok) throw new Error(`accept failed: ${acceptResp.status}`);
    const accepted = (await acceptResp.json()) as { matchId: string };

    await fetch(`${baseUrl}/api/matches/${accepted.matchId}/moves`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ side: "A", moves: [{ type: "ATTACK", gas: 2 }, { type: "DEFEND" }] }),
    });

    await fetch(`${baseUrl}/api/matches/${accepted.matchId}/moves`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ side: "B", moves: [{ type: "ATTACK", gas: 2 }, { type: "RECHARGE_EXTRA" }] }),
    });

    const beforeReset = await fetch(`${baseUrl}/api/leaderboard/global`);
    const beforePayload = (await beforeReset.json()) as { rows: unknown[] };
    if (beforePayload.rows.length === 0) {
      throw new Error("expected leaderboard rows before reset");
    }

    process.env.NODE_ENV = "production";
    const prodResp = await fetch(`${baseUrl}/api/dev/reset`, { method: "POST" });
    if (prodResp.status !== 404) {
      throw new Error(`expected 404 outside development, got ${prodResp.status}`);
    }
    process.env.NODE_ENV = "development";

    const resetResp = await fetch(`${baseUrl}/api/dev/reset`, { method: "POST" });
    if (!resetResp.ok) throw new Error(`reset failed: ${resetResp.status}`);
    const resetPayload = (await resetResp.json()) as {
      ok: boolean;
      cleared: { challenges: number; matches: number; moves: number; players: number; economyEvents: number };
    };

    if (!resetPayload.ok) {
      throw new Error("expected ok=true from reset");
    }

    if (resetPayload.cleared.challenges < 1 || resetPayload.cleared.matches < 1 || resetPayload.cleared.moves < 2) {
      throw new Error(`unexpected cleared counts: ${JSON.stringify(resetPayload.cleared)}`);
    }

    process.env.DEV_RESET_TOKEN = "expected-token";
    const forbiddenResp = await fetch(`${baseUrl}/api/dev/reset`, { method: "POST" });
    if (forbiddenResp.status !== 403) {
      throw new Error(`expected 403 without token when DEV_RESET_TOKEN is set, got ${forbiddenResp.status}`);
    }

    const authorizedResp = await fetch(`${baseUrl}/api/dev/reset`, {
      method: "POST",
      headers: { "x-dev-reset-token": "expected-token" },
    });
    if (!authorizedResp.ok) {
      throw new Error(`expected reset to accept valid token, got ${authorizedResp.status}`);
    }
    delete process.env.DEV_RESET_TOKEN;

    const afterReset = await fetch(`${baseUrl}/api/leaderboard/global`);
    const afterPayload = (await afterReset.json()) as { rows: unknown[] };
    if (afterPayload.rows.length !== 0) {
      throw new Error("expected empty leaderboard after reset");
    }

    const openAfter = await fetch(`${baseUrl}/api/challenges/open`);
    const openPayload = (await openAfter.json()) as { items: unknown[] };
    if (openPayload.items.length !== 0) {
      throw new Error("expected open challenges to be empty after reset");
    }

    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
