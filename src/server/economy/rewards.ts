import type { SummaryV1 } from "../../core/sim/simulate.ts";

export type MatchRewards = {
  gasCoinsA: number;
  gasCoinsB: number;
  stinkFameA: number;
  stinkFameB: number;
  breakdown: {
    gasCoins: { A: string[]; B: string[] };
    stinkFame: { A: string[]; B: string[] };
  };
};

export function computeMatchRewards(summary: SummaryV1): MatchRewards {
  let gasCoinsA = summary.winner === "A" ? 20 : summary.winner === "DRAW" ? 10 : 5;
  let gasCoinsB = summary.winner === "B" ? 20 : summary.winner === "DRAW" ? 10 : 5;
  let stinkFameA = summary.winner === "A" ? 5 : summary.winner === "DRAW" ? 3 : 1;
  let stinkFameB = summary.winner === "B" ? 5 : summary.winner === "DRAW" ? 3 : 1;

  const breakdown: MatchRewards["breakdown"] = {
    gasCoins: {
      A: [`${summary.winner === "A" ? "winner" : summary.winner === "DRAW" ? "draw" : "loser"} base`],
      B: [`${summary.winner === "B" ? "winner" : summary.winner === "DRAW" ? "draw" : "loser"} base`],
    },
    stinkFame: {
      A: [`${summary.winner === "A" ? "winner" : summary.winner === "DRAW" ? "draw" : "loser"} base`],
      B: [`${summary.winner === "B" ? "winner" : summary.winner === "DRAW" ? "draw" : "loser"} base`],
    },
  };

  if (summary.highlights.cataclysms.A >= 1) {
    gasCoinsA += 5;
    breakdown.gasCoins.A.push("cataclysm bonus");
  }
  if (summary.highlights.cataclysms.B >= 1) {
    gasCoinsB += 5;
    breakdown.gasCoins.B.push("cataclysm bonus");
  }

  if (summary.winner === "A" && summary.highlights.clutchWin) {
    gasCoinsA += 10;
    breakdown.gasCoins.A.push("clutch bonus");
  }
  if (summary.winner === "B" && summary.highlights.clutchWin) {
    gasCoinsB += 10;
    breakdown.gasCoins.B.push("clutch bonus");
  }

  if (summary.winner === "A" && summary.highlights.humiliationWin) {
    gasCoinsA += 15;
    breakdown.gasCoins.A.push("humiliation bonus");
  }
  if (summary.winner === "B" && summary.highlights.humiliationWin) {
    gasCoinsB += 15;
    breakdown.gasCoins.B.push("humiliation bonus");
  }

  if (summary.highlights.maxHitValue >= 9 && summary.highlights.maxHitBy === "A") {
    stinkFameA += 3;
    breakdown.stinkFame.A.push("max-hit bonus");
  }
  if (summary.highlights.maxHitValue >= 9 && summary.highlights.maxHitBy === "B") {
    stinkFameB += 3;
    breakdown.stinkFame.B.push("max-hit bonus");
  }

  if (summary.winner === "A" && summary.a.backfires >= 1) {
    stinkFameA += 2;
    breakdown.stinkFame.A.push("backfire-survivor bonus");
  }
  if (summary.winner === "B" && summary.b.backfires >= 1) {
    stinkFameB += 2;
    breakdown.stinkFame.B.push("backfire-survivor bonus");
  }

  return { gasCoinsA, gasCoinsB, stinkFameA, stinkFameB, breakdown };
}
