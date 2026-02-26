import type { CreatureSpec, Move } from "../../core/types.ts";
import type {
  CreateChallengeInput,
  FinalizedPayload,
  ReplayPayload,
  Side,
  StoredChallenge,
  StoredMatch,
  StoredMoves,
} from "./types.ts";

export interface Store {
  createChallenge(input: CreateChallengeInput): Promise<StoredChallenge>;
  getChallengeByToken(token: string): Promise<StoredChallenge | undefined>;
  acceptChallenge(token: string, creatureB: CreatureSpec): Promise<StoredMatch>;
  submitMoves(matchId: string, side: Side, moves: Move[]): Promise<StoredMoves>;
  getMatch(matchId: string): Promise<StoredMatch | undefined>;
  getMatchByPublicId(publicId: string): Promise<StoredMatch | undefined>;
  finalizeMatchIfReady(matchId: string): Promise<StoredMatch>;
  getReplayByPublicId(publicId: string): Promise<ReplayPayload | undefined>;
  getFinalizedPayload(matchId: string): Promise<FinalizedPayload | undefined>;
}
