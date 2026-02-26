import { rm } from "node:fs/promises";
import path from "node:path";
import { RULESET_VERSION } from "../src/core/types.ts";
import { getDailyMission } from "../src/server/economy/missions.ts";
import { JsonStore } from "../src/server/storage/jsonStore.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const baseDir = path.resolve(process.cwd(), "data", "faf-test-economy");
  await rm(baseDir, { recursive: true, force: true });

  const store = new JsonStore(baseDir, "test-secret");
  const a = await store.getOrCreatePlayer();
  const b = await store.getOrCreatePlayer();

  const challenge = await store.createChallenge({
    creatureA: { rulesetVersion: RULESET_VERSION, classKey: "goblin", cosmeticSeed: 1 },
    playerAId: a.id,
  });

  const match = await store.acceptChallenge(challenge.token, { rulesetVersion: RULESET_VERSION, classKey: "dragon", cosmeticSeed: 2 }, b.id);

  await store.submitMoves(match.id, "A", [
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
  ]);
  await store.submitMoves(match.id, "B", [
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 1 },
    { rulesetVersion: RULESET_VERSION, type: "RECHARGE_EXTRA" },
    { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 1 },
  ]);

  await store.finalizeMatchIfReady(match.id);
  const before = await store.getOrCreatePlayer(a.id);
  await store.applyMatchRewards(match.id);
  const after = await store.getOrCreatePlayer(a.id);
  assert(before.gasCoins === after.gasCoins && before.stinkFame === after.stinkFame, "match rewards must be idempotent");

  const s1 = await store.recordShare(a.id, match.publicId);
  const s2 = await store.recordShare(a.id, match.publicId);
  const s3 = await store.recordShare(a.id, `${match.publicId}-x`);
  const s4 = await store.recordShare(a.id, `${match.publicId}-y`);
  const s5 = await store.recordShare(a.id, `${match.publicId}-z`);
  assert(s1.awarded && s1.stinkFameGained === 2, "first share should award");
  assert(!s2.awarded && s2.stinkFameGained === 0, "duplicate share should be idempotent");
  assert(s3.awarded && s4.awarded, "second/third daily shares should award");
  assert(!s5.awarded, "daily share limit should block fourth share");

  const fixedDate = "2026-01-15T12:00:00.000Z";
  const m1 = getDailyMission(fixedDate, a.id);
  const m2 = getDailyMission(fixedDate, a.id);
  assert(m1.type === m2.type, "mission must be deterministic");

  const mission1 = await store.checkAndAwardDailyMission(a.id, fixedDate);
  const pBefore = await store.getOrCreatePlayer(a.id);
  const mission2 = await store.checkAndAwardDailyMission(a.id, fixedDate);
  const pAfter = await store.getOrCreatePlayer(a.id);
  assert(mission1.mission.type === mission2.mission.type, "same mission expected");
  assert(pBefore.gasCoins === pAfter.gasCoins && pBefore.stinkFame === pAfter.stinkFame, "mission award must be once");

  console.log("ok");
}

await main();
