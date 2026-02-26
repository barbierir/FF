import { deriveSeedU64 } from "../src/core/sim/deriveSeed.ts";
import { simulateMatch } from "../src/core/sim/simulate.ts";
import { RULESET_VERSION } from "../src/core/types.ts";
import type { MatchInput } from "../src/core/types.ts";

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected=${String(expected)} actual=${String(actual)}`);
  }
}

const vectorDragonTroll: { input: MatchInput; serverSalt: string; expected: { seedU64: bigint; eventCount: number; winner: "A" | "B" | "DRAW"; matchHash: string } } = {
  input: {
    rulesetVersion: RULESET_VERSION,
    challengeId: "determinism-vector-001",
    creatureA: { rulesetVersion: RULESET_VERSION, classKey: "dragon", cosmeticSeed: 111 },
    creatureB: { rulesetVersion: RULESET_VERSION, classKey: "troll", cosmeticSeed: 222 },
    createdAtISO: "2026-01-01T00:00:00.000Z",
    movesA: [
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 3 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 1 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 2 },
    ],
    movesB: [
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "DEFEND" },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 3 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "RECHARGE_EXTRA" },
    ],
  },
  serverSalt: "salt-0",
  expected: {
    seedU64: 14615525513193507803n,
    eventCount: 21,
    winner: "DRAW",
    matchHash: "edb10929f345f49b6d8a2cf07880f9cd5e5e4c3dcd152dbc624861c9ec5d24d7",
  },
};

const vectorFairySkunk: { input: MatchInput; serverSalt: string; expected: { seedU64: bigint; eventCount: number; winner: "A" | "B" | "DRAW"; matchHash: string } } = {
  input: {
    rulesetVersion: RULESET_VERSION,
    challengeId: "determinism-vector-002",
    creatureA: { rulesetVersion: RULESET_VERSION, classKey: "fairy", cosmeticSeed: 333 },
    creatureB: { rulesetVersion: RULESET_VERSION, classKey: "skunk", cosmeticSeed: 444 },
    createdAtISO: "2026-02-02T00:00:00.000Z",
    movesA: [
      { rulesetVersion: RULESET_VERSION, type: "HEAL" },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 3 },
      { rulesetVersion: RULESET_VERSION, type: "HEAL" },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 2 },
      { rulesetVersion: RULESET_VERSION, type: "HEAL" },
    ],
    movesB: [
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4, safe: true },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "DEFEND" },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 3 },
      { rulesetVersion: RULESET_VERSION, type: "ATTACK", gas: 4 },
      { rulesetVersion: RULESET_VERSION, type: "RECHARGE_EXTRA" },
    ],
  },
  serverSalt: "s2-12",
  expected: {
    seedU64: 2892894268894075264n,
    eventCount: 26,
    winner: "B",
    matchHash: "ca94ff616f73f04906a6beacfe28559e8d156c82274aaddd917d1c57108f24dc",
  },
};

for (const vector of [vectorDragonTroll, vectorFairySkunk]) {
  const seedU64 = deriveSeedU64(vector.input, vector.serverSalt);
  const { events, summary } = simulateMatch(vector.input, seedU64);

  assertEqual(seedU64, vector.expected.seedU64, `${vector.input.challengeId}:seedU64`);
  assertEqual(events.length, vector.expected.eventCount, `${vector.input.challengeId}:eventCount`);
  assertEqual(summary.winner, vector.expected.winner, `${vector.input.challengeId}:winner`);
  assertEqual(summary.matchHash, vector.expected.matchHash, `${vector.input.challengeId}:matchHash`);
}

const dragonTroll = simulateMatch(vectorDragonTroll.input, deriveSeedU64(vectorDragonTroll.input, vectorDragonTroll.serverSalt));
if (!dragonTroll.events.some((event) => event.tags?.includes("DRAGON_PLUS1"))) throw new Error("missing DRAGON_PLUS1");
if (!dragonTroll.events.some((event) => event.tags?.includes("TROLL_RETAL"))) throw new Error("missing TROLL_RETAL");
if (!dragonTroll.events.some((event) => event.outcome === "BACKFIRE")) throw new Error("missing BACKFIRE");
if (!dragonTroll.events.some((event) => event.outcome === "CATACLYSM")) throw new Error("missing CATACLYSM");

const fairySkunk = simulateMatch(vectorFairySkunk.input, deriveSeedU64(vectorFairySkunk.input, vectorFairySkunk.serverSalt));
if (!fairySkunk.events.some((event) => event.kind === "HEAL")) throw new Error("missing HEAL");
if (!fairySkunk.events.some((event) => event.tags?.includes("SKUNK_SAFE_USED"))) throw new Error("missing SKUNK_SAFE_USED");
if (!fairySkunk.events.some((event) => event.tags?.includes("SKUNK_SAFE_PREVENTED_BACKFIRE"))) throw new Error("missing SKUNK_SAFE_PREVENTED_BACKFIRE");

console.log("ok");
console.log(`locked hash vector-001: ${vectorDragonTroll.expected.matchHash}`);
console.log(`locked hash vector-002: ${vectorFairySkunk.expected.matchHash}`);
