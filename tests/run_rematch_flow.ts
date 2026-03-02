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
    const outsiderId = "pla_rematch_C";

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
      body: JSON.stringify({ playerId: playerAId, side: "A", moves: [{ type: "ATTACK", gas: 2 }] }),
    });
    await api(baseUrl, `/api/matches/${accepted.matchId}/moves`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerBId, side: "B", moves: [{ type: "DEFEND" }] }),
    });

    const rematch = await api(baseUrl, `/api/rematch/${accepted.publicId}`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerAId, side: "A" }),
    });

    if (!rematch.token) throw new Error("missing rematch token");

    const rematchAgain = await api(baseUrl, `/api/rematch/${accepted.publicId}`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerAId, side: "A" }),
    });
    if (rematchAgain.token !== rematch.token) {
      throw new Error("rematch endpoint is not idempotent");
    }

    await api(baseUrl, `/api/challenges/${rematch.token}?viewerId=${playerBId}`);

    let outsiderStatus = 0;
    const outsiderRes = await fetch(`${baseUrl}/api/challenges/${rematch.token}?viewerId=${outsiderId}`);
    outsiderStatus = outsiderRes.status;
    if (outsiderStatus !== 403) {
      throw new Error(`expected outsider to be rejected with 403, got ${outsiderStatus}`);
    }

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

    const challengeForAAfterBJoin = await api(baseUrl, `/api/challenges/${rematch.token}?viewerId=${playerAId}`);
    if (challengeForAAfterBJoin.status !== "accepted" || challengeForAAfterBJoin.matchId !== rematchAccepted.matchId) {
      throw new Error("accepted rematch should remain visible to player A with active match metadata");
    }

    const waiting = await api(baseUrl, `/api/matches/${rematchAccepted.matchId}/moves`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerBId, side: "A", moves: [{ type: "DEFEND" }] }),
    });
    if (waiting.status !== "waiting_for_opponent") {
      throw new Error("first rematch submit should wait for opponent");
    }

    const challengeForAAfterBMove = await api(baseUrl, `/api/challenges/${rematch.token}?viewerId=${playerAId}`);
    if (challengeForAAfterBMove.matchId !== rematchAccepted.matchId) {
      throw new Error("player A should still be able to load accepted rematch after player B submits");
    }

    const done = await api(baseUrl, `/api/matches/${rematchAccepted.matchId}/moves`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerAId, side: "B", moves: [{ type: "ATTACK", gas: 1 }] }),
    });
    if (done.status !== "finished" || !done.replayUrl) {
      throw new Error("both rematch moves did not finalize");
    }

    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
