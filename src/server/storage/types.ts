import type { CreatureSpec, MatchInput, Move } from "../../core/types.ts";
import type { Mission } from "../economy/missions.ts";

export type ChallengeStatus = "open" | "accepted" | "expired";
export type MatchStatus = "collecting_moves" | "finished";
export type Side = "A" | "B";

export type StoredChallenge = {
  id: string;
  token: string;
  status: ChallengeStatus;
  ruleset_version: string;
  creatureA: CreatureSpec;
  creatureB?: CreatureSpec;
  createdAtISO: string;
  expiresAtISO: string;
  acceptedAtISO?: string;
  matchId?: string;
  playerAId?: string | null;
  playerBId?: string | null;
  rematchOfPublicId?: string;
};

export type StoredMatch = {
  id: string;
  challengeId: string;
  publicId: string;
  status: MatchStatus;
  playerAId?: string | null;
  playerBId?: string | null;
  input_json?: string;
  seed_hex?: string;
  events_json?: string;
  summary_json?: string;
  match_hash_hex?: string;
  createdAtISO: string;
  finalizedAtISO?: string;
  playerACreatureIdSnapshot?: string;
  playerBCreatureIdSnapshot?: string;
  playerACreatureNicknameSnapshot?: string;
  playerBCreatureNicknameSnapshot?: string;
};

export type StoredMoves = {
  id: string;
  matchId: string;
  side: Side;
  moves_received_json: string;
  moves_json: string;
  submitted_at: string;
};

export type PlayerProfile = {
  id: string;
  createdAtISO: string;
  gasCoins: number;
  stinkFame: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  matchesPlayed: number;
  totalDamageDealt: number;
  maxHitEver: number;
  totalBackfires: number;
  totalCataclysms: number;
  creatureId?: string;
  creatureNickname?: string;
  lastMissionDay?: string;
  lastShareDay?: string;
  lastShareCountDay?: number;
};

export type EconomyEvent = {
  id: string;
  type: string;
  playerId?: string;
  matchId?: string;
  createdAtISO: string;
  payload: Record<string, unknown>;
};

export type CreateChallengeInput = {
  creatureA: CreatureSpec;
  expiresInHours?: number;
  playerAId?: string | null;
  rematchOfPublicId?: string;
};

export type ResetCounts = {
  challenges: number;
  matches: number;
  moves: number;
  players: number;
  economyEvents: number;
};

export type FinalizedPayload = {
  input: MatchInput;
  events: unknown[];
  summary: Record<string, unknown>;
  seedHex: string;
  matchHash: string;
};

export type ReplayPayload = {
  input: MatchInput;
  events: unknown[];
  summary: Record<string, unknown>;
  matchHash: string;
  seedHex: string;
  match: {
    publicId: string;
    playerAId: string | null;
    playerBId: string | null;
    challengeId: string;
  };
};

export type SideMovesSubmission = {
  side: Side;
  moves: Move[];
};

export type MissionStatus = {
  mission: Mission;
  completed: boolean;
  awarded?: { gc: number; sf: number };
};

export type PublicProfile = {
  gasCoins: number;
  stinkFame: number;
  wins: number;
  losses: number;
  draws: number;
  leaderboardRank?: number;
  bestStreak: number;
  maxHitEver: number;
  totalCataclysms: number;
  totalBackfires: number;
};

export type PublicRecentMatch = {
  publicId: string;
  winner: "A" | "B" | "DRAW";
  maxHit: number;
  createdAtISO: string;
  playerAId?: string;
  playerBId?: string;
  playerACreatureId?: string;
  playerBCreatureId?: string;
  playerANickname?: string;
  playerBNickname?: string;
  opponentPlayerId?: string;
  opponentCreatureId?: string;
  opponentCreatureNickname?: string;
  resultLabel?: "Victory" | "Defeat" | "Draw";
};

export type PublicRivalryRow = {
  opponentId: string;
  totalMatches: number;
  wins: number;
  losses: number;
};

export type PublicPlayerResponse = {
  profile: PublicProfile;
  recentMatches: PublicRecentMatch[];
  rivalries: PublicRivalryRow[];
};

export type GlobalLeaderboardRow = {
  rank: number;
  playerId: string;
  creatureId?: string;
  creatureNickname?: string;
  wins: number;
  losses: number;
  draws: number;
  played: number;
};

export type RivalryStats = {
  totalMatches: number;
  winsA: number;
  winsB: number;
  totalDamageA: number;
  totalDamageB: number;
  matches: string[];
};

export type DailyHighlight = {
  highlightType: "highest_max_hit" | "most_cataclysms" | "most_humiliating_win";
  highlightLabel: string;
  valueLabel: string;
  publicId: string;
  playerId: string;
  value: number;
  playerCreatureId?: string;
  playerCreatureNickname?: string;
};

export type OpenChallengeItem = {
  token: string;
  createdAtISO: string;
  expiresAtISO: string;
  creatureA: CreatureSpec;
  playerAId: string | null;
  status: ChallengeStatus;
};
