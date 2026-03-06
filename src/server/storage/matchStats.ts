import type { SummaryV1 } from "../../core/types.ts";
import type { StoredChallenge, StoredMatch } from "./types.ts";

export type PlayerMatchStats = {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  rank: number;
};

function isCompletedMatch(match: StoredMatch): match is StoredMatch & { summary_json: string } {
  return match.status === "finished" && Boolean(match.summary_json);
}

export function buildLeaderboard(matches: StoredMatch[], challenges: StoredChallenge[]): PlayerMatchStats[] {
  const challengeById = new Map(challenges.map((challenge) => [challenge.id, challenge]));
  const statsByPlayer = new Map<string, Omit<PlayerMatchStats, "rank">>();

  const ensure = (playerId: string): Omit<PlayerMatchStats, "rank"> => {
    const existing = statsByPlayer.get(playerId);
    if (existing) return existing;
    const created = { playerId, wins: 0, losses: 0, draws: 0, played: 0 };
    statsByPlayer.set(playerId, created);
    return created;
  };

  for (const match of matches) {
    if (!isCompletedMatch(match)) continue;
    const challenge = challengeById.get(match.challengeId);
    if (!challenge) continue;

    const summary = JSON.parse(match.summary_json) as SummaryV1;

    const applySide = (playerId: string | null | undefined, side: "A" | "B") => {
      if (!playerId) return;
      const row = ensure(playerId);
      row.played += 1;
      if (summary.winner === "DRAW") {
        row.draws += 1;
      } else if (summary.winner === side) {
        row.wins += 1;
      } else {
        row.losses += 1;
      }
    };

    applySide(challenge.playerAId, "A");
    applySide(challenge.playerBId, "B");
  }

  return [...statsByPlayer.values()]
    .sort((a, b) => b.wins - a.wins || b.draws - a.draws || a.losses - b.losses || a.playerId.localeCompare(b.playerId))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function getPlayerProfileStats(playerId: string, leaderboard: PlayerMatchStats[]): PlayerMatchStats | undefined {
  return leaderboard.find((row) => row.playerId === playerId);
}
