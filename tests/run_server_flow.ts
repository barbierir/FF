import { rm } from "node:fs/promises";
import path from "node:path";
import { JsonStore } from "../src/server/storage/jsonStore.ts";
import { RULESET_VERSION } from "../src/core/types.ts";

async function main(): Promise<void> {
  const baseDir = path.resolve(process.cwd(), "data", "faf-test-flow");
  await rm(baseDir, { recursive: true, force: true });

  const store = new JsonStore(baseDir, "test-secret");

  const challenge = await store.createChallenge({
    creatureA: { rulesetVersion: RULESET_VERSION, classKey: "goblin", cosmeticSeed: 11 },
    expiresInHours: 2,
  });

  const match = await store.acceptChallenge(challenge.token, {
    rulesetVersion: RULESET_VERSION,
    classKey: "dragon",
    cosmeticSeed: 99,
  });

  await store.submitMoves(match.id, "A", [
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 2 },
    { rulesetVersion: RULESET_VERSION, type: "RECHARGE_EXTRA" },
  ]);

  await store.submitMoves(match.id, "B", [
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 2 },
    { rulesetVersion: RULESET_VERSION, type: "DEFEND" },
  ]);

  const finalized = await store.finalizeMatchIfReady(match.id);
  if (finalized.status !== "finished") {
    throw new Error("Match did not finish");
  }

  const full = await store.getFinalizedPayload(match.id);
  if (!full) {
    throw new Error("Missing finalized payload");
  }

  const summary = full.summary as { matchHash?: string };
  if (!summary.matchHash || summary.matchHash !== finalized.match_hash_hex) {
    throw new Error("summary.matchHash mismatch");
  }

  const replay = await store.getReplayByPublicId(match.publicId);
  if (!replay) {
    throw new Error("Replay not found");
  }

  if (replay.matchHash !== finalized.match_hash_hex) {
    throw new Error("Replay hash mismatch");
  }

  if (!Array.isArray(replay.events) || replay.events.length === 0) {
    throw new Error("Replay events missing");
  }

  console.log("ok");
}

await main();
