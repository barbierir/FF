import { rm } from "node:fs/promises";
import path from "node:path";

async function api(baseUrl: string, p: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${baseUrl}${p}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

async function main(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), "data", "faf");
  await rm(dataDir, { recursive: true, force: true });

  process.env.PORT = "3311";
  const { createApiServer } = await import("../src/server/index.ts");
  const server = createApiServer();

  await new Promise<void>((resolve) => server.listen(3311, resolve));
  const baseUrl = "http://localhost:3311";

  try {
    const playerAId = "pla_rematch_A";
    const playerBId = "pla_rematch_B";

    const challenge = await api(baseUrl, "/api/challenges", {
      method: "POST",
      body: JSON.stringify({
        playerId: playerAId,
        creatureA: { classKey: "skunk", cosmeticSeed: 321 },
      }),
    });

    const accepted = await api(baseUrl, `/api/challenges/${challenge.token}/accept`, {
      method: "POST",
      body: JSON.stringify({
        playerId: playerBId,
        creatureB: { classKey: "dragon", cosmeticSeed: 444 },
      }),
    });

    await api(baseUrl, `/api/matches/${accepted.matchId}/moves`, {
      method: "POST",
      body: JSON.stringify({ side: "A", moves: [{ type: "ATTACK", gas: 2 }] }),
    });
    await api(baseUrl, `/api/matches/${accepted.matchId}/moves`, {
      method: "POST",
      body: JSON.stringify({ side: "B", moves: [{ type: "DEFEND" }] }),
    });

    const rematch = await api(baseUrl, `/api/rematch/${accepted.publicId}`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerAId, side: "A" }),
    });

    if (!rematch.token) throw new Error("missing rematch token");

    const open = await api(baseUrl, `/api/challenges/open?excludePlayerId=${playerBId}&limit=20`);
    if (!open.items.some((item: { token: string }) => item.token === rematch.token)) {
      throw new Error("rematch token missing from open list");
    }

    const rematchAccepted = await api(baseUrl, `/api/challenges/${rematch.token}/accept`, {
      method: "POST",
      body: JSON.stringify({
        playerId: playerBId,
        creatureB: { classKey: "troll", cosmeticSeed: 7 },
      }),
    });

    if (!rematchAccepted.matchId) throw new Error("rematch accept did not create match");
    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
