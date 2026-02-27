import type { Move } from "../core/types.ts";
import { HttpError } from "./errors.ts";
import type { Store } from "./storage/store.ts";
import type { Side, StoredChallenge } from "./storage/types.ts";

export async function createRematchFromReplay(
  store: Store,
  publicId: string,
  playerId: string,
  side: Side,
): Promise<StoredChallenge> {
  const match = await store.getMatchByPublicId(publicId);
  if (!match || match.status !== "finished") {
    throw new HttpError(404, "replay_not_found", "Replay not found");
  }

  const replay = await store.getReplayByPublicId(publicId);
  if (!replay) {
    throw new HttpError(409, "replay_incomplete", "Replay is incomplete");
  }

  const sidePlayerId = side === "A" ? (match.playerAId ?? null) : (match.playerBId ?? null);
  if (sidePlayerId && sidePlayerId !== playerId) {
    throw new HttpError(403, "player_mismatch", "playerId does not match side playerId");
  }

  const existing = await store.getOpenRematchChallenge(publicId, playerId);
  if (existing) {
    return existing;
  }

  return store.createChallenge({
    creatureA: side === "A" ? replay.input.creatureA : replay.input.creatureB,
    expiresInHours: 24,
    playerAId: playerId,
    rematchOfPublicId: publicId,
  });
}

export async function loadChallengeForViewer(store: Store, token: string, viewerId?: string): Promise<StoredChallenge> {
  if (viewerId) {
    return store.joinChallengeIfEligible(token, viewerId);
  }
  const challenge = await store.getChallengeByToken(token);
  if (!challenge) {
    throw new HttpError(404, "challenge_not_found", "Challenge not found");
  }
  return challenge;
}

export async function submitMovesForPlayer(
  store: Store,
  matchId: string,
  playerId: string,
  moves: Move[],
  sideHint?: Side,
): Promise<{ side: Side; status: "waiting_for_opponent" | "finished"; sideHintIgnored: boolean }> {
  const match = await store.getMatch(matchId);
  if (!match) {
    throw new HttpError(404, "match_not_found", "Match not found");
  }
  if (match.status === "finished") {
    throw new HttpError(409, "match_finished", "Match is already finished");
  }

  const challenge = await store.getChallengeById(match.challengeId);
  if (!challenge) {
    throw new HttpError(409, "challenge_state_invalid", "Challenge state is invalid");
  }

  const side: Side = challenge.playerAId === playerId ? "A" : challenge.playerBId === playerId ? "B" : (() => {
    throw new HttpError(403, "player_not_in_match", "playerId is not part of this match");
  })();

  const classKey = side === "A" ? challenge.creatureA?.classKey : challenge.creatureB?.classKey;
  if (!classKey) {
    throw new HttpError(409, "challenge_state_invalid", "Challenge state is invalid");
  }

  await store.submitMoves(matchId, side, moves);
  const finalized = await store.finalizeMatchIfReady(matchId);
  return {
    side,
    status: finalized.status === "finished" ? "finished" : "waiting_for_opponent",
    sideHintIgnored: sideHint !== undefined && sideHint !== side,
  };
}
