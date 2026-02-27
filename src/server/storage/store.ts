import type { CreatureSpec, Move } from "../../core/types.ts";
import type { LeaderboardMetric, LeaderboardRow, LeaderboardScope } from "../economy/leaderboards.ts";
import type {
  CreateChallengeInput,
  DailyHighlight,
  FinalizedPayload,
  GlobalLeaderboardRow,
  MissionStatus,
  PlayerProfile,
  PublicPlayerResponse,
  ReplayPayload,
  ResetCounts,
  RivalryStats,
  Side,
  StoredChallenge,
  StoredMatch,
  StoredMoves,
} from "./types.ts";

export interface Store {
  createChallenge(input: CreateChallengeInput): Promise<StoredChallenge>;
  getChallengeById(challengeId: string): Promise<StoredChallenge | undefined>;
  getChallengeByToken(token: string): Promise<StoredChallenge | undefined>;
  getOpenRematchChallenge(rematchOfPublicId: string, playerAId: string): Promise<StoredChallenge | undefined>;
  joinChallengeIfEligible(token: string, viewerId: string): Promise<StoredChallenge>;
  listChallenges(playerId: string | undefined, status: "open" | "accepted", limit: number, excludePlayerId?: string): Promise<StoredChallenge[]>;
  acceptChallenge(token: string, creatureB: CreatureSpec, playerBId?: string | null): Promise<StoredMatch>;
  submitMoves(matchId: string, side: Side, moves: Move[]): Promise<StoredMoves>;
  getMovesForMatch(matchId: string): Promise<Partial<Record<Side, Move[]>>>;
  getMatch(matchId: string): Promise<StoredMatch | undefined>;
  getMatchByPublicId(publicId: string): Promise<StoredMatch | undefined>;
  finalizeMatchIfReady(matchId: string): Promise<StoredMatch>;
  getReplayByPublicId(publicId: string): Promise<ReplayPayload | undefined>;
  getFinalizedPayload(matchId: string): Promise<FinalizedPayload | undefined>;
  getOrCreatePlayer(playerId?: string): Promise<PlayerProfile>;
  applyMatchRewards(matchId: string): Promise<void>;
  recordShare(playerId: string, matchPublicId: string): Promise<{ awarded: boolean; stinkFameGained: number }>;
  recordChallengeAccepted(challengeId: string): Promise<void>;
  checkAndAwardDailyMission(playerId: string, dateISO: string): Promise<MissionStatus>;
  getLeaderboard(scope: LeaderboardScope, metric: LeaderboardMetric): Promise<LeaderboardRow[]>;
  getPublicPlayer(playerId: string): Promise<PublicPlayerResponse | undefined>;
  getGlobalLeaderboard(): Promise<GlobalLeaderboardRow[]>;
  getRivalry(playerA: string, playerB: string): Promise<RivalryStats>;
  getDailyHighlight(nowISO?: string): Promise<DailyHighlight | undefined>;
  resetAllData(): Promise<ResetCounts>;
}
