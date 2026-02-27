import type { SummaryV1 } from "../../core/sim/simulate.ts";

function sideLabel(summary: SummaryV1, side: "A" | "B"): string {
  return side === "A" ? summary.a.classKey : summary.b.classKey;
}

export function buildShareText(summary: SummaryV1, publicId: string, baseUrl: string): string {
  const winnerSide = summary.winner === "DRAW" ? summary.highlights.maxHitBy : summary.winner;
  const loserSide = winnerSide === "A" ? "B" : "A";
  const winner = sideLabel(summary, winnerSide === "DRAW" ? "A" : winnerSide);
  const loser = sideLabel(summary, loserSide);
  return `My ${winner} destroyed a ${loser} with a ${summary.highlights.maxHitValue} DAMAGE Cataclysm 💨🔥\nCan you beat me?\n${baseUrl}/r/${publicId}`;
}
