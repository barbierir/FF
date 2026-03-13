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


    const manualChallenge = await api(baseUrl, "/api/challenges", {
      method: "POST",
      body: JSON.stringify({
        playerId: playerAId,
        creatureA: { classKey: "goblin", cosmeticSeed: 901 },
        mode: "manual",
      }),
    });

    const manualAccepted = await api(baseUrl, `/api/challenges/${manualChallenge.token}/accept`, {
      method: "POST",
      body: JSON.stringify({
        playerId: playerBId,
        creatureB: { classKey: "troll", cosmeticSeed: 11 },
      }),
    });

    let manualFinished = false;
    for (let turn = 0; turn < 30; turn += 1) {
      const aTurn = await api(baseUrl, `/api/matches/${manualAccepted.matchId}/action`, {
        method: "POST",
        body: JSON.stringify({ playerId: playerAId, action: { type: "ATTACK", gas: 1 } }),
      });
      if (aTurn.status === "finished") {
        manualFinished = true;
        break;
      }
      const bTurn = await api(baseUrl, `/api/matches/${manualAccepted.matchId}/action`, {
        method: "POST",
        body: JSON.stringify({ playerId: playerBId, action: { type: "ATTACK", gas: 1 } }),
      });
      if (bTurn.status === "finished") {
        manualFinished = true;
        break;
      }
    }
    if (!manualFinished) {
      throw new Error("manual seed match did not finish");
    }

    const manualMatchMeta = await api(baseUrl, `/api/matches/${manualAccepted.matchId}`);
    const manualRematch = await api(baseUrl, `/api/rematch/${manualMatchMeta.publicId}`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerAId, side: "A" }),
    });
    const manualRematchChallenge = await api(baseUrl, `/api/challenges/${manualRematch.token}?viewerId=${playerAId}`);
    if (manualRematchChallenge.mode !== "manual") {
      throw new Error(`manual rematch mode was not preserved (got ${manualRematchChallenge.mode})`);
    }

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

    if (rematchAccepted.publicId) {
      const replay = await api(baseUrl, `/api/replay/${rematchAccepted.publicId}`);
      if (!Array.isArray(replay.events) || replay.events.length === 0) {
        throw new Error("auto rematch should have finalized replay events");
      }
    } else {
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
    }

    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
