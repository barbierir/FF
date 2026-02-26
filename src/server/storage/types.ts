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
};

export type StoredMatch = {
  id: string;
  challengeId: string;
  publicId: string;
  status: MatchStatus;
  input_json?: string;
  seed_hex?: string;
  events_json?: string;
  summary_json?: string;
  match_hash_hex?: string;
  createdAtISO: string;
  finalizedAtISO?: string;
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
