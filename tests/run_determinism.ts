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
    creatureA: { classKey: "dragon", cosmeticSeed: 111 },
    creatureB: { classKey: "troll", cosmeticSeed: 222 },
    createdAtISO: "2026-01-01T00:00:00.000Z",
    movesA: [
      { type: "ATTACK", gas: 4 },
      { type: "ATTACK", gas: 3 },
      { type: "ATTACK", gas: 4 },
      { type: "ATTACK", gas: 1 },
      { type: "ATTACK", gas: 4 },
      { type: "ATTACK", gas: 2 },
    ],
    movesB: [
      { type: "ATTACK", gas: 4 },
      { type: "DEFEND" },
      { type: "ATTACK", gas: 4 },
      { type: "ATTACK", gas: 3 },
      { type: "ATTACK", gas: 4 },
      { type: "RECHARGE_EXTRA" },
    ],
  },
  serverSalt: "salt-0",
  expected: {
    seedU64: 5073227062599289047n,
    eventCount: 16,
    winner: "DRAW",
    matchHash: "0761054f936af544fe5d7f8cb9d28c04a25dcc96cd7d43cfd79e4235e73398b3",
  },
};

const vectorFairySkunk: { input: MatchInput; serverSalt: string; expected: { seedU64: bigint; eventCount: number; winner: "A" | "B" | "DRAW"; matchHash: string } } = {
  input: {
    rulesetVersion: RULESET_VERSION,
    challengeId: "determinism-vector-002",
    creatureA: { classKey: "fairy", cosmeticSeed: 333 },
    creatureB: { classKey: "skunk", cosmeticSeed: 444 },
    createdAtISO: "2026-02-02T00:00:00.000Z",
    movesA: [
      { type: "HEAL" },
      { type: "ATTACK", gas: 3 },
      { type: "HEAL" },
      { type: "ATTACK", gas: 4 },
      { type: "ATTACK", gas: 2 },
      { type: "HEAL" },
    ],
    movesB: [
      { type: "ATTACK", gas: 4, safe: true },
      { type: "ATTACK", gas: 4 },
      { type: "DEFEND" },
      { type: "ATTACK", gas: 3 },
      { type: "ATTACK", gas: 4 },
      { type: "RECHARGE_EXTRA" },
    ],
  },
  serverSalt: "s2-12",
  expected: {
    seedU64: 1635065213275221499n,
    eventCount: 45,
    winner: "DRAW",
    matchHash: "d8385ea374871fe148ec78473fc31dda61369856d6f660623589e4baecc94bc7",
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

console.log("ok");
console.log(`locked hash vector-001: ${vectorDragonTroll.expected.matchHash}`);
console.log(`locked hash vector-002: ${vectorFairySkunk.expected.matchHash}`);
