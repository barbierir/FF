import type { SummaryV1 } from "../../core/sim/simulate.ts";
import type { StoredChallenge, StoredMatch, EconomyEvent } from "../storage/types.ts";

export type LeaderboardScope = "daily" | "weekly";
export type LeaderboardMetric = "stinkFame" | "maxHit" | "cataclysms";

export type LeaderboardRow = { rank: number; playerId: string; value: number };

export type LeaderboardData = {
  matches: StoredMatch[];
  challenges: StoredChallenge[];
  economyEvents: EconomyEvent[];
};

function inScope(iso: string | undefined, scope: LeaderboardScope, now = new Date()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const end = now.getTime();
  if (scope === "daily") {
    const dayKey = now.toISOString().slice(0, 10);
    return iso.startsWith(dayKey);
  }
  return t >= end - 7 * 24 * 3600 * 1000 && t <= end;
}

export function computeLeaderboards(data: LeaderboardData, scope: LeaderboardScope, metric: LeaderboardMetric): LeaderboardRow[] {
  const values = new Map<string, number>();

  if (metric === "stinkFame") {
    for (const evt of data.economyEvents) {
      if (!evt.playerId || !inScope(evt.createdAtISO, scope)) continue;
      const sf = Number((evt.payload as { sf?: number })?.sf ?? 0);
      if (sf <= 0) continue;
      values.set(evt.playerId, (values.get(evt.playerId) ?? 0) + sf);
    }
  } else {
    const challengeById = new Map(data.challenges.map((c) => [c.id, c]));
    for (const match of data.matches) {
      if (match.status !== "finished" || !inScope(match.finalizedAtISO, scope) || !match.summary_json) continue;
      const summary = JSON.parse(match.summary_json) as SummaryV1;
      const challenge = challengeById.get(match.challengeId);
      if (!challenge) continue;

      const assign = (playerId: string | undefined, side: "A" | "B", val: number): void => {
        if (!playerId) return;
        const prev = values.get(playerId) ?? (metric === "maxHit" ? 0 : 0);
        values.set(playerId, metric === "maxHit" ? Math.max(prev, val) : prev + val);
      };

      if (metric === "maxHit") {
        assign(challenge.playerAId ?? undefined, "A", summary.a.maxHit);
        assign(challenge.playerBId ?? undefined, "B", summary.b.maxHit);
      } else if (metric === "cataclysms") {
        assign(challenge.playerAId ?? undefined, "A", summary.highlights.cataclysms.A);
        assign(challenge.playerBId ?? undefined, "B", summary.highlights.cataclysms.B);
      }
    }
  }

  return [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([playerId, value], idx) => ({ rank: idx + 1, playerId, value }));
}
