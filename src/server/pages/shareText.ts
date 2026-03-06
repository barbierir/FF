import type { SummaryV1 } from "../../core/sim/simulate.ts";

function sideLabel(summary: SummaryV1, side: "A" | "B"): string {
  return side === "A" ? summary.a.classKey : summary.b.classKey;
}

export function buildShareText(summary: SummaryV1, publicId: string, baseUrl: string, nicknames?: { a?: string; b?: string }): string {
  const winnerSide = summary.winner === "DRAW" ? summary.highlights.maxHitBy : summary.winner;
  const loserSide = winnerSide === "A" ? "B" : "A";
  const winnerResolvedSide = winnerSide === "DRAW" ? "A" : winnerSide;
  const winner = winnerResolvedSide === "A" ? (nicknames?.a || sideLabel(summary, "A")) : (nicknames?.b || sideLabel(summary, "B"));
  const loser = loserSide === "A" ? (nicknames?.a || sideLabel(summary, "A")) : (nicknames?.b || sideLabel(summary, "B"));
  return `My ${winner} destroyed a ${loser} with a ${summary.highlights.maxHitValue} DAMAGE Cataclysm 💨🔥\nCan you beat me?\n${baseUrl}/r/${publicId}`;
}

export function buildRematchText(summary: SummaryV1, replayUrl: string, rematchUrl: string): string {
  return `REMATCH ME 💨🔥 I survived this chaos: ${replayUrl} — Now accept: ${rematchUrl}`;
}
