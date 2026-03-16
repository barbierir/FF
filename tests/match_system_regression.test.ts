import { describe, expect, it } from "vitest";

import { RULESET_VERSION } from "../src/core/types";
import type { MatchInput, Move } from "../src/core/types";
import { simulateMatch } from "../src/core/sim/simulate";

function buildInput(movesA: Move[], movesB: Move[]): MatchInput {
  return {
    rulesetVersion: RULESET_VERSION,
    challengeId: "regression-check",
    creatureA: { classKey: "goblin", cosmeticSeed: 1 },
    creatureB: { classKey: "dragon", cosmeticSeed: 2 },
    movesA,
    movesB,
    createdAtISO: "2026-01-01T00:00:00.000Z",
  };
}

describe("match system regression checks", () => {
  it("resolves beyond the previous ~12 turn threshold while keeping a safety cap", () => {
    const movesA: Move[] = Array.from({ length: 24 }, () => ({ type: "DEFEND" }));
    const movesB: Move[] = Array.from({ length: 24 }, () => ({ type: "DEFEND" }));
    const result = simulateMatch(buildInput(movesA, movesB), 42n);

    expect(result.summary.turns).toBeGreaterThan(12);
    expect(result.summary.turns).toBeLessThanOrEqual(25);
    expect(result.summary.winner).toBe("DRAW");
  });

  it("does not force a draw around turn 12 when the fight can still resolve decisively", () => {
    const movesA: Move[] = Array.from({ length: 24 }, () => ({ type: "ATTACK", gas: 1 }));
    const movesB: Move[] = Array.from({ length: 24 }, () => ({ type: "ATTACK", gas: 1 }));
    const result = simulateMatch(buildInput(movesA, movesB), 169n);

    expect(result.summary.turns).toBeGreaterThanOrEqual(13);
    expect(result.summary.winner).toBe("A");
  });
});
