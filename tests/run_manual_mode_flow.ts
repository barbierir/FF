import assert from "node:assert/strict";
import { JsonStore } from "../src/server/storage/jsonStore.ts";

async function main() {
  const store = new JsonStore(undefined, "test-secret");
  await store.resetAllData();
  const challenge = await store.createChallenge({
    creatureA: { classKey: "goblin", cosmeticSeed: 1 },
    playerAId: "pA",
    mode: "manual",
  });
  const match = await store.acceptChallenge(challenge.token, { classKey: "dragon", cosmeticSeed: 2 }, "pB");
  assert.equal(match.mode, "manual");

  const wait = await store.submitTurnAction(match.id, "A", { type: "ATTACK", gas: 1 });
  assert.equal(wait.status, "waiting_for_opponent");

  await assert.rejects(() => store.submitTurnAction(match.id, "A", { type: "ATTACK", gas: 1 }));

  const resolved = await store.submitTurnAction(match.id, "B", { type: "ATTACK", gas: 1 });
  assert.ok(resolved.status === "turn_resolved" || resolved.status === "finished");
}

main();
