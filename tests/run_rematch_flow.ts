import { rm } from "node:fs/promises";
import path from "node:path";
import { JsonStore } from "../src/server/storage/jsonStore.ts";

async function main(): Promise<void> {
  const baseDir = path.resolve(process.cwd(), "data", "faf-test-rematch-flow");
  await rm(baseDir, { recursive: true, force: true });

  const store = new JsonStore(baseDir, "test-secret");
  const playerAId = "pla_rematch_A";
  const playerBId = "pla_rematch_B";

  const challenge = await store.createChallenge({
    creatureA: { classKey: "skunk", cosmeticSeed: 321 },
    expiresInHours: 2,
    playerAId,
  });

  const match = await store.acceptChallenge(
    challenge.token,
    { classKey: "dragon", cosmeticSeed: 444 },
    playerBId,
  );

  await store.submitMoves(match.id, "A", [{ type: "ATTACK", gas: 2 }]);
  await store.submitMoves(match.id, "B", [{ type: "DEFEND" }]);

  const finalized = await store.finalizeMatchIfReady(match.id);
  if (finalized.status !== "finished") throw new Error("match not finished");

  const replay = await store.getReplayByPublicId(finalized.publicId);
  if (!replay) throw new Error("missing replay");
  if (replay.match.playerAId !== playerAId || replay.match.playerBId !== playerBId) {
    throw new Error("player IDs missing in replay payload");
  }

  const rematch = await store.createChallenge({
    creatureA: replay.input.creatureA,
    playerAId,
    expiresInHours: 24,
  });

  if (!rematch.token) throw new Error("missing rematch token");
  if (rematch.creatureA.classKey !== challenge.creatureA.classKey || rematch.creatureA.cosmeticSeed !== challenge.creatureA.cosmeticSeed) {
    throw new Error("rematch creature did not match original creator creature");
  }

  console.log("ok");
}

await main();
