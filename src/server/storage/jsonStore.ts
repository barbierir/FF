import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "../../core/codec/canonicalJson.ts";
import { sha256Hex } from "../../core/crypto/hash.ts";
import { deriveSeedU64 } from "../../core/sim/deriveSeed.ts";
import { deriveMatchHash, simulateMatch } from "../../core/sim/simulate.ts";
import { RULESET_VERSION } from "../../core/types.ts";
import type { CreatureSpec, MatchInput, Move } from "../../core/types.ts";
import { HttpError } from "../errors.ts";
import { computeLeaderboards } from "../economy/leaderboards.ts";
import type { LeaderboardMetric, LeaderboardRow, LeaderboardScope } from "../economy/leaderboards.ts";
import { getDailyMission, toDayKey } from "../economy/missions.ts";
import type { MissionStatus } from "./types.ts";
import { computeMatchRewards } from "../economy/rewards.ts";
import type { SummaryV1 } from "../../core/sim/simulate.ts";
import type { Store } from "./store.ts";
import type {
  CreateChallengeInput,
  DailyHighlight,
  EconomyEvent,
  FinalizedPayload,
  GlobalLeaderboardRow,
  PlayerProfile,
  PublicPlayerResponse,
  ReplayPayload,
  RivalryStats,
  Side,
  StoredChallenge,
  StoredMatch,
  StoredMoves,
} from "./types.ts";

type DbState = {
  challenges: StoredChallenge[];
  matches: StoredMatch[];
  moves: StoredMoves[];
  players: PlayerProfile[];
  economyEvents: EconomyEvent[];
};

const MAX_TURNS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function randomToken(size = 24): string {
  return randomBytes(size).toString("base64url");
}

function createProfile(id: string): PlayerProfile {
  return {
    id,
    createdAtISO: nowIso(),
    gasCoins: 0,
    stinkFame: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    matchesPlayed: 0,
    totalDamageDealt: 0,
    maxHitEver: 0,
    totalBackfires: 0,
    totalCataclysms: 0,
  };
}

function assertMoveShape(move: Move, index: number): void {
  if (move.type === "ATTACK") {
    if (!Number.isInteger(move.gas) || move.gas < 1 || move.gas > 4) {
      throw new Error(`Invalid gas at moves[${index}]`);
    }
    if (move.safe !== undefined && typeof move.safe !== "boolean") {
      throw new Error(`Invalid safe flag at moves[${index}]`);
    }
    return;
  }

  if (move.type === "DEFEND" || move.type === "RECHARGE_EXTRA" || move.type === "HEAL") {
    return;
  }

  throw new Error(`Invalid move type at moves[${index}]`);
}

function validateMoves(moves: Move[]): void {
  if (!Array.isArray(moves)) {
    throw new Error("moves must be an array");
  }

  if (moves.length > MAX_TURNS) {
    throw new Error(`moves length exceeds max turns (${MAX_TURNS})`);
  }

  moves.forEach((move, idx) => assertMoveShape(move, idx));
}

export class JsonStore implements Store {
  private readonly baseDir: string;
  private readonly challengesPath: string;
  private readonly matchesPath: string;
  private readonly movesPath: string;
  private readonly playersPath: string;
  private readonly economyEventsPath: string;
  private readonly serverSecret: string;

  private state: DbState = { challenges: [], matches: [], moves: [], players: [], economyEvents: [] };

  private ready: Promise<void>;

  constructor(baseDir = path.resolve(process.cwd(), "data", "faf"), serverSecret?: string) {
    this.baseDir = baseDir;
    this.challengesPath = path.join(baseDir, "challenges.json");
    this.matchesPath = path.join(baseDir, "matches.json");
    this.movesPath = path.join(baseDir, "moves.json");
    this.playersPath = path.join(baseDir, "players.json");
    this.economyEventsPath = path.join(baseDir, "economy_events.json");
    this.serverSecret = serverSecret ?? process.env.MATCH_SECRET ?? "dev-secret";
    if (!process.env.MATCH_SECRET && !serverSecret) {
      console.warn("[FAF] MATCH_SECRET is not set; using insecure fallback 'dev-secret'.");
    }
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });

    this.state.challenges = await this.loadJson<StoredChallenge[]>(this.challengesPath, []);
    this.state.matches = await this.loadJson<StoredMatch[]>(this.matchesPath, []);
    this.state.moves = await this.loadJson<StoredMoves[]>(this.movesPath, []);
    this.state.players = await this.loadJson<PlayerProfile[]>(this.playersPath, []);
    this.state.economyEvents = await this.loadJson<EconomyEvent[]>(this.economyEventsPath, []);
  }

  private async loadJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      await this.atomicWrite(filePath, JSON.stringify(fallback, null, 2));
      return fallback;
    }
  }

  private async atomicWrite(filePath: string, contents: string): Promise<void> {
    const tempPath = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(tempPath, contents, "utf8");
    await rename(tempPath, filePath);
  }

  private async flush(): Promise<void> {
    await this.atomicWrite(this.challengesPath, JSON.stringify(this.state.challenges, null, 2));
    await this.atomicWrite(this.matchesPath, JSON.stringify(this.state.matches, null, 2));
    await this.atomicWrite(this.movesPath, JSON.stringify(this.state.moves, null, 2));
    await this.atomicWrite(this.playersPath, JSON.stringify(this.state.players, null, 2));
    await this.atomicWrite(this.economyEventsPath, JSON.stringify(this.state.economyEvents, null, 2));
  }

  private parseReplay(match: StoredMatch): ReplayPayload | undefined {
    if (!match.input_json || !match.events_json || !match.summary_json || !match.seed_hex || !match.match_hash_hex) {
      return undefined;
    }

    return {
      input: JSON.parse(match.input_json) as MatchInput,
      events: JSON.parse(match.events_json) as unknown[],
      summary: JSON.parse(match.summary_json) as Record<string, unknown>,
      matchHash: match.match_hash_hex,
      seedHex: match.seed_hex,
      match: {
        publicId: match.publicId,
        playerAId: match.playerAId ?? null,
        playerBId: match.playerBId ?? null,
        challengeId: match.challengeId,
      },
    };
  }

  private findPlayer(playerId: string): PlayerProfile {
    const existing = this.state.players.find((player) => player.id === playerId);
    if (existing) return existing;
    const created = createProfile(playerId);
    this.state.players.push(created);
    return created;
  }

  private hasEvent(eventId: string): boolean {
    return this.state.economyEvents.some((evt) => evt.id === eventId);
  }

  private pushEvent(event: EconomyEvent): void {
    this.state.economyEvents.push(event);
  }

  private isFinishedMatchWithSummary(match: StoredMatch): match is StoredMatch & { summary_json: string; finalizedAtISO: string } {
    return match.status === "finished" && Boolean(match.summary_json) && Boolean(match.finalizedAtISO);
  }

  private findMatchChallenge(match: StoredMatch): StoredChallenge | undefined {
    return this.state.challenges.find((item) => item.id === match.challengeId);
  }

  async createChallenge(input: CreateChallengeInput): Promise<StoredChallenge> {
    await this.ready;
    const createdAtISO = nowIso();
    const expiresInHoursRaw = input.expiresInHours ?? 24;
    const expiresInHours = Math.min(168, Math.max(1, expiresInHoursRaw));
    const expiresAtISO = new Date(Date.parse(createdAtISO) + expiresInHours * 3600 * 1000).toISOString();
    const challenge: StoredChallenge = {
      id: randomId("chal"),
      token: randomToken(18),
      status: "open",
      ruleset_version: RULESET_VERSION,
      creatureA: input.creatureA,
      createdAtISO,
      expiresAtISO,
      playerAId: input.playerAId ?? null,
      playerBId: null,
      rematchOfPublicId: input.rematchOfPublicId,
    };

    this.state.challenges.push(challenge);
    await this.flush();
    return challenge;
  }

  async getChallengeByToken(token: string): Promise<StoredChallenge | undefined> {
    await this.ready;
    return this.state.challenges.find((challenge) => challenge.token === token);
  }

  async getOpenRematchChallenge(rematchOfPublicId: string, playerAId: string): Promise<StoredChallenge | undefined> {
    await this.ready;
    const now = Date.now();
    return this.state.challenges.find(
      (challenge) =>
        challenge.status === "open" &&
        challenge.rematchOfPublicId === rematchOfPublicId &&
        challenge.playerAId === playerAId &&
        new Date(challenge.expiresAtISO).getTime() > now,
    );
  }

  async joinChallengeIfEligible(token: string, viewerId: string): Promise<StoredChallenge> {
    await this.ready;
    const challenge = this.state.challenges.find((item) => item.token === token);
    if (!challenge) {
      throw new HttpError(404, "challenge_not_found", "Challenge not found");
    }

    if (challenge.playerAId === viewerId || challenge.playerBId === viewerId) {
      return challenge;
    }

    if (challenge.status !== "open") {
      throw new HttpError(403, "challenge_forbidden", "Challenge is only visible to participating players");
    }

    if (new Date(challenge.expiresAtISO).getTime() <= Date.now()) {
      challenge.status = "expired";
      await this.flush();
      throw new HttpError(410, "challenge_expired", "Challenge has expired");
    }

    if (!challenge.playerBId) {
      challenge.playerBId = viewerId;
      await this.flush();
      return challenge;
    }

    throw new HttpError(403, "challenge_forbidden", "Challenge is only visible to participating players");
  }

  async getChallengeById(challengeId: string): Promise<StoredChallenge | undefined> {
    await this.ready;
    return this.state.challenges.find((challenge) => challenge.id === challengeId);
  }

  async listChallenges(
    playerId: string | undefined,
    status: "open" | "accepted",
    limit: number,
    excludePlayerId?: string,
  ): Promise<StoredChallenge[]> {
    await this.ready;
    const now = Date.now();
    const boundedLimit = Math.min(50, Math.max(1, limit));
    return this.state.challenges
      .filter((challenge) => {
        if (challenge.status !== status) return false;
        if (new Date(challenge.expiresAtISO).getTime() <= now) return false;
        if (playerId && challenge.playerAId !== playerId && challenge.playerBId !== playerId) return false;
        if (excludePlayerId && challenge.playerAId === excludePlayerId) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAtISO) - Date.parse(a.createdAtISO))
      .slice(0, boundedLimit);
  }

  async acceptChallenge(token: string, creatureB: CreatureSpec, playerBId?: string | null): Promise<StoredMatch> {
    await this.ready;
    const challenge = this.state.challenges.find((item) => item.token === token);
    if (!challenge) {
      throw new HttpError(404, "challenge_not_found", "Challenge not found");
    }

    if (new Date(challenge.expiresAtISO).getTime() <= Date.now()) {
      challenge.status = "expired";
      await this.flush();
      throw new HttpError(410, "challenge_expired", "Challenge has expired");
    }

    if (challenge.status !== "open") {
      throw new HttpError(409, "challenge_not_open", "Challenge is not open");
    }

    challenge.status = "accepted";
    challenge.acceptedAtISO = nowIso();
    challenge.creatureB = creatureB;
    challenge.playerBId = playerBId ?? null;

    const match: StoredMatch = {
      id: randomId("match"),
      challengeId: challenge.id,
      publicId: randomToken(18),
      status: "collecting_moves",
      playerAId: challenge.playerAId ?? null,
      playerBId: challenge.playerBId ?? null,
      createdAtISO: nowIso(),
    };

    challenge.matchId = match.id;
    this.state.matches.push(match);
    await this.recordChallengeAccepted(challenge.id);
    await this.flush();
    return match;
  }

  async submitMoves(matchId: string, side: Side, moves: Move[]): Promise<StoredMoves> {
    await this.ready;
    validateMoves(moves);
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new HttpError(404, "match_not_found", "Match not found");
    }

    if (match.status === "finished") {
      throw new HttpError(409, "match_finished", "Match is already finished");
    }

    const canonicalMoves = canonicalStringify(moves);
    const existing = this.state.moves.find((item) => item.matchId === matchId && item.side === side);
    if (existing) {
      if (existing.moves_json === canonicalMoves) {
        return existing;
      }
      throw new HttpError(409, "moves_already_submitted", `Moves already submitted for side ${side}`);
    }

    const record: StoredMoves = {
      id: randomId("mv"),
      matchId,
      side,
      moves_received_json: JSON.stringify(moves),
      moves_json: canonicalMoves,
      submitted_at: nowIso(),
    };

    this.state.moves.push(record);
    await this.flush();
    return record;
  }

  async getMatch(matchId: string): Promise<StoredMatch | undefined> {
    await this.ready;
    return this.state.matches.find((item) => item.id === matchId);
  }

  async getMatchByPublicId(publicId: string): Promise<StoredMatch | undefined> {
    await this.ready;
    return this.state.matches.find((item) => item.publicId === publicId);
  }

  async finalizeMatchIfReady(matchId: string): Promise<StoredMatch> {
    await this.ready;
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }

    if (match.status === "finished") {
      return match;
    }

    const challenge = this.state.challenges.find((item) => item.id === match.challengeId);
    if (!challenge || !challenge.creatureB) {
      throw new Error("Challenge state is invalid");
    }

    const movesA = this.state.moves.find((item) => item.matchId === matchId && item.side === "A");
    const movesB = this.state.moves.find((item) => item.matchId === matchId && item.side === "B");

    if (!movesA || !movesB) {
      return match;
    }

    const input: MatchInput = {
      rulesetVersion: RULESET_VERSION,
      challengeId: challenge.id,
      creatureA: challenge.creatureA,
      creatureB: challenge.creatureB,
      movesA: JSON.parse(movesA.moves_json) as Move[],
      movesB: JSON.parse(movesB.moves_json) as Move[],
      createdAtISO: challenge.createdAtISO,
    };

    const serverSalt = sha256Hex(`${this.serverSecret}:${challenge.id}`);
    const seedU64 = deriveSeedU64(input, serverSalt);
    const seedHex = sha256Hex(canonicalStringify({ input, serverSalt }));
    const { events, summary } = simulateMatch(input, seedU64);

    const summaryWithoutHash = { ...summary, matchHash: undefined };
    delete (summaryWithoutHash as { matchHash?: string }).matchHash;
    const matchHash = deriveMatchHash(input, events, summaryWithoutHash as Omit<typeof summary, "matchHash">);
    const finalSummary = { ...summaryWithoutHash, matchHash };

    match.input_json = canonicalStringify(input);
    match.seed_hex = seedHex;
    match.events_json = canonicalStringify(events);
    match.summary_json = canonicalStringify(finalSummary);
    match.match_hash_hex = matchHash;
    match.status = "finished";
    match.finalizedAtISO = nowIso();

    // Rewards are deterministic because they derive only from SummaryV1 and are idempotent via event IDs.
    await this.applyMatchRewards(matchId);
    await this.recordRivalry(match);
    await this.flush();
    return match;
  }

  private async recordRivalry(match: StoredMatch): Promise<void> {
    if (!match.summary_json) return;
    const challenge = this.findMatchChallenge(match);
    if (!challenge?.playerAId || !challenge.playerBId) return;
    const [playerLo, playerHi] = [challenge.playerAId, challenge.playerBId].sort((a, b) => a.localeCompare(b));
    const eventId = `rivalry:${match.id}`;
    if (this.hasEvent(eventId)) return;
    this.pushEvent({
      id: eventId,
      type: "rivalry_increment",
      matchId: match.id,
      createdAtISO: match.finalizedAtISO ?? nowIso(),
      payload: { playerLo, playerHi, publicId: match.publicId },
    });
  }

  async getReplayByPublicId(publicId: string): Promise<ReplayPayload | undefined> {
    await this.ready;
    const match = this.state.matches.find((item) => item.publicId === publicId);
    if (!match) {
      return undefined;
    }
    return this.parseReplay(match);
  }

  async getFinalizedPayload(matchId: string): Promise<FinalizedPayload | undefined> {
    await this.ready;
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) {
      return undefined;
    }
    const parsed = this.parseReplay(match);
    if (!parsed) {
      return undefined;
    }

    return {
      input: parsed.input,
      events: parsed.events,
      summary: parsed.summary,
      seedHex: parsed.seedHex,
      matchHash: parsed.matchHash,
    };
  }

  async getOrCreatePlayer(playerId?: string): Promise<PlayerProfile> {
    await this.ready;
    const resolved = playerId && playerId.length > 0 ? playerId : randomId("guest");
    const profile = this.findPlayer(resolved);
    await this.flush();
    return profile;
  }

  async applyMatchRewards(matchId: string): Promise<void> {
    await this.ready;
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new HttpError(404, "match_not_found", "Match not found");
    }
    if (match.status !== "finished" || !match.summary_json) {
      throw new HttpError(409, "match_not_finished", "Cannot apply rewards before match is finished");
    }

    const challenge = this.state.challenges.find((item) => item.id === match.challengeId);
    if (!challenge?.playerAId && !challenge?.playerBId) return;

    const summary = JSON.parse(match.summary_json) as SummaryV1;
    const rewards = computeMatchRewards(summary);

    const applyToSide = (side: Side): void => {
      const playerId = side === "A" ? challenge.playerAId : challenge.playerBId;
      if (!playerId) return;
      const eventId = `match_reward:${match.id}:${side}`;
      if (this.hasEvent(eventId)) return;
      const profile = this.findPlayer(playerId);
      const sideSummary = side === "A" ? summary.a : summary.b;
      const won = summary.winner === side;
      const draw = summary.winner === "DRAW";
      const gc = side === "A" ? rewards.gasCoinsA : rewards.gasCoinsB;
      const sf = side === "A" ? rewards.stinkFameA : rewards.stinkFameB;

      profile.gasCoins += gc;
      profile.stinkFame += sf;
      profile.matchesPlayed += 1;
      profile.totalDamageDealt += sideSummary.totalDamage;
      profile.maxHitEver = Math.max(profile.maxHitEver, sideSummary.maxHit);
      profile.totalBackfires += sideSummary.backfires;
      profile.totalCataclysms += side === "A" ? summary.highlights.cataclysms.A : summary.highlights.cataclysms.B;

      if (draw) {
        profile.draws += 1;
        profile.currentStreak = 0;
      } else if (won) {
        profile.wins += 1;
        profile.currentStreak += 1;
        profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak);
      } else {
        profile.losses += 1;
        profile.currentStreak = 0;
      }

      this.pushEvent({
        id: eventId,
        type: "match_reward",
        playerId,
        matchId: match.id,
        createdAtISO: nowIso(),
        payload: {
          side,
          gc,
          sf,
          winner: summary.winner,
          breakdown: side === "A" ? { gc: rewards.breakdown.gasCoins.A, sf: rewards.breakdown.stinkFame.A } : { gc: rewards.breakdown.gasCoins.B, sf: rewards.breakdown.stinkFame.B },
        },
      });
    };

    applyToSide("A");
    applyToSide("B");
    await this.flush();
  }

  async recordShare(playerId: string, matchPublicId: string): Promise<{ awarded: boolean; stinkFameGained: number }> {
    await this.ready;
    const profile = this.findPlayer(playerId);
    const match = this.state.matches.find((item) => item.publicId === matchPublicId);
    if (!match || match.status !== "finished") {
      throw new HttpError(404, "replay_not_found", "Replay not found for share");
    }
    const day = toDayKey(nowIso());
    const eventId = `share:${playerId}:${matchPublicId}:${day}`;
    if (this.hasEvent(eventId)) {
      return { awarded: false, stinkFameGained: 0 };
    }

    const usedToday = profile.lastShareDay === day ? profile.lastShareCountDay ?? 0 : 0;
    if (usedToday >= 3) {
      this.pushEvent({ id: eventId, type: "share_no_award", playerId, createdAtISO: nowIso(), payload: { matchPublicId, day } });
      await this.flush();
      return { awarded: false, stinkFameGained: 0 };
    }

    profile.stinkFame += 2;
    profile.lastShareDay = day;
    profile.lastShareCountDay = usedToday + 1;
    this.pushEvent({
      id: eventId,
      type: "share_award",
      playerId,
      createdAtISO: nowIso(),
      payload: { matchPublicId, day, sf: 2 },
    });

    await this.flush();
    return { awarded: true, stinkFameGained: 2 };
  }

  async recordChallengeAccepted(challengeId: string): Promise<void> {
    await this.ready;
    const eventId = `challenge_accept:${challengeId}`;
    if (this.hasEvent(eventId)) return;
    const challenge = this.state.challenges.find((item) => item.id === challengeId);
    if (!challenge?.playerAId) return;
    const profile = this.findPlayer(challenge.playerAId);
    profile.gasCoins += 10;
    profile.stinkFame += 5;
    this.pushEvent({
      id: eventId,
      type: "challenge_accepted_bonus",
      playerId: challenge.playerAId,
      createdAtISO: nowIso(),
      payload: { challengeId, gc: 10, sf: 5 },
    });
  }

  async checkAndAwardDailyMission(playerId: string, dateISO: string): Promise<MissionStatus> {
    await this.ready;
    const profile = this.findPlayer(playerId);
    const mission = getDailyMission(dateISO, playerId);
    const day = toDayKey(dateISO);
    const dayPrefix = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;

    const challengeById = new Map(this.state.challenges.map((challenge) => [challenge.id, challenge]));
    const matchesToday = this.state.matches.filter((match) => {
      if (match.status !== "finished" || !match.finalizedAtISO?.startsWith(dayPrefix)) return false;
      const challenge = challengeById.get(match.challengeId);
      return challenge?.playerAId === playerId || challenge?.playerBId === playerId;
    });

    const completed = matchesToday.some((match) => {
      if (!match.summary_json) return false;
      const summary = JSON.parse(match.summary_json) as SummaryV1;
      const challenge = challengeById.get(match.challengeId);
      const side: Side | undefined = challenge?.playerAId === playerId ? "A" : challenge?.playerBId === playerId ? "B" : undefined;
      if (!side) return false;
      const sideSummary = side === "A" ? summary.a : summary.b;
      switch (mission.type) {
        case "PLAY_1":
          return true;
        case "WIN_1":
          return summary.winner === side;
        case "CATACLYSM_1":
          return side === "A" ? summary.highlights.cataclysms.A >= 1 : summary.highlights.cataclysms.B >= 1;
        case "BACKFIRE_SURVIVE":
          return sideSummary.backfires >= 1 && (summary.winner === side || summary.winner === "DRAW");
        case "MAXHIT_9":
          return sideSummary.maxHit >= 9;
      }
    });

    const awardId = `mission:${playerId}:${day}:${mission.type}`;
    if (completed && !this.hasEvent(awardId)) {
      profile.gasCoins += mission.reward.gc;
      profile.stinkFame += mission.reward.sf;
      profile.lastMissionDay = day;
      this.pushEvent({
        id: awardId,
        type: "daily_mission_award",
        playerId,
        createdAtISO: nowIso(),
        payload: { day, missionType: mission.type, gc: mission.reward.gc, sf: mission.reward.sf },
      });
      await this.flush();
      return { mission, completed: true, awarded: mission.reward };
    }

    await this.flush();
    return { mission, completed, awarded: this.hasEvent(awardId) ? mission.reward : undefined };
  }

  async getLeaderboard(scope: LeaderboardScope, metric: LeaderboardMetric): Promise<LeaderboardRow[]> {
    await this.ready;
    return computeLeaderboards(
      {
        matches: this.state.matches,
        challenges: this.state.challenges,
        economyEvents: this.state.economyEvents,
      },
      scope,
      metric,
    );
  }

  async getPublicPlayer(playerId: string): Promise<PublicPlayerResponse | undefined> {
    await this.ready;
    const profile = this.state.players.find((player) => player.id === playerId);
    if (!profile) return undefined;

    const challengeById = new Map(this.state.challenges.map((challenge) => [challenge.id, challenge]));
    const involvedMatches = this.state.matches
      .filter((match) => this.isFinishedMatchWithSummary(match))
      .map((match) => ({ match, challenge: challengeById.get(match.challengeId) }))
      .filter((row) => row.challenge && (row.challenge.playerAId === playerId || row.challenge.playerBId === playerId));

    const recentMatches = involvedMatches
      .slice()
      .sort((a, b) => Date.parse(b.match.finalizedAtISO) - Date.parse(a.match.finalizedAtISO))
      .slice(0, 10)
      .map(({ match }) => {
        const summary = JSON.parse(match.summary_json) as SummaryV1;
        return {
          publicId: match.publicId,
          winner: summary.winner,
          maxHit: summary.highlights.maxHitValue,
          createdAtISO: match.finalizedAtISO,
        };
      });

    const rivalryMap = new Map<string, { totalMatches: number; wins: number; losses: number }>();
    for (const row of involvedMatches) {
      const challenge = row.challenge;
      if (!challenge) continue;
      const summary = JSON.parse(row.match.summary_json) as SummaryV1;
      const isA = challenge.playerAId === playerId;
      const opponentId = isA ? challenge.playerBId : challenge.playerAId;
      if (!opponentId) continue;
      const bucket = rivalryMap.get(opponentId) ?? { totalMatches: 0, wins: 0, losses: 0 };
      bucket.totalMatches += 1;
      if (summary.winner !== "DRAW") {
        const won = (summary.winner === "A" && isA) || (summary.winner === "B" && !isA);
        if (won) bucket.wins += 1;
        else bucket.losses += 1;
      }
      rivalryMap.set(opponentId, bucket);
    }

    const rivalries = [...rivalryMap.entries()]
      .map(([opponentId, stats]) => ({ opponentId, ...stats }))
      .sort((a, b) => b.totalMatches - a.totalMatches || a.opponentId.localeCompare(b.opponentId));

    return {
      profile: {
        gasCoins: profile.gasCoins,
        stinkFame: profile.stinkFame,
        wins: profile.wins,
        losses: profile.losses,
        draws: profile.draws,
        bestStreak: profile.bestStreak,
        maxHitEver: profile.maxHitEver,
        totalCataclysms: profile.totalCataclysms,
        totalBackfires: profile.totalBackfires,
      },
      recentMatches,
      rivalries,
    };
  }

  async getGlobalLeaderboard(): Promise<GlobalLeaderboardRow[]> {
    await this.ready;
    return this.state.players
      .slice()
      .sort((a, b) => b.stinkFame - a.stinkFame || b.wins - a.wins || a.id.localeCompare(b.id))
      .slice(0, 50)
      .map((player) => ({
        playerId: player.id,
        stinkFame: player.stinkFame,
        wins: player.wins,
        maxHitEver: player.maxHitEver,
      }));
  }

  async getRivalry(playerA: string, playerB: string): Promise<RivalryStats> {
    await this.ready;
    const challengeById = new Map(this.state.challenges.map((challenge) => [challenge.id, challenge]));
    const matches = this.state.matches
      .filter((match) => this.isFinishedMatchWithSummary(match))
      .filter((match) => {
        const challenge = challengeById.get(match.challengeId);
        if (!challenge?.playerAId || !challenge.playerBId) return false;
        return (
          (challenge.playerAId === playerA && challenge.playerBId === playerB) ||
          (challenge.playerAId === playerB && challenge.playerBId === playerA)
        );
      });

    let winsA = 0;
    let winsB = 0;
    let totalDamageA = 0;
    let totalDamageB = 0;
    const publicIds: string[] = [];

    for (const match of matches) {
      const challenge = challengeById.get(match.challengeId);
      if (!challenge) continue;
      const summary = JSON.parse(match.summary_json) as SummaryV1;
      const aIsLeft = challenge.playerAId === playerA;
      const sideForA = aIsLeft ? "A" : "B";
      const sideForB = aIsLeft ? "B" : "A";
      totalDamageA += sideForA === "A" ? summary.a.totalDamage : summary.b.totalDamage;
      totalDamageB += sideForB === "A" ? summary.a.totalDamage : summary.b.totalDamage;
      if (summary.winner === sideForA) winsA += 1;
      if (summary.winner === sideForB) winsB += 1;
      publicIds.push(match.publicId);
    }

    return {
      totalMatches: matches.length,
      winsA,
      winsB,
      totalDamageA,
      totalDamageB,
      matches: publicIds,
    };
  }

  async getDailyHighlight(nowISO = nowIso()): Promise<DailyHighlight | undefined> {
    await this.ready;
    const dayPrefix = nowISO.slice(0, 10);
    const challengeById = new Map(this.state.challenges.map((challenge) => [challenge.id, challenge]));
    const todayMatches = this.state.matches
      .filter((match) => this.isFinishedMatchWithSummary(match))
      .filter((match) => match.finalizedAtISO.startsWith(dayPrefix));
    if (todayMatches.length === 0) return undefined;

    let highestMaxHit: DailyHighlight | undefined;
    let mostCataclysms: DailyHighlight | undefined;
    let mostHumiliating: DailyHighlight | undefined;

    for (const match of todayMatches) {
      const challenge = challengeById.get(match.challengeId);
      if (!challenge) continue;
      const summary = JSON.parse(match.summary_json) as SummaryV1;

      const maxHitPlayer = summary.highlights.maxHitBy === "A" ? challenge.playerAId : challenge.playerBId;
      if (maxHitPlayer) {
        const candidate: DailyHighlight = {
          highlightType: "highest_max_hit",
          publicId: match.publicId,
          playerId: maxHitPlayer,
          value: summary.highlights.maxHitValue,
        };
        if (!highestMaxHit || candidate.value > highestMaxHit.value) highestMaxHit = candidate;
      }

      const catA = summary.highlights.cataclysms.A;
      const catB = summary.highlights.cataclysms.B;
      const maxCat = catA >= catB ? { v: catA, p: challenge.playerAId } : { v: catB, p: challenge.playerBId };
      if (maxCat.p) {
        const candidate: DailyHighlight = {
          highlightType: "most_cataclysms",
          publicId: match.publicId,
          playerId: maxCat.p,
          value: maxCat.v,
        };
        if (!mostCataclysms || candidate.value > mostCataclysms.value) mostCataclysms = candidate;
      }

      if (summary.highlights.humiliationWin && summary.winner !== "DRAW") {
        const humPlayer = summary.winner === "A" ? challenge.playerAId : challenge.playerBId;
        const loserPr = summary.winner === "A" ? summary.b.prFinal : summary.a.prFinal;
        if (humPlayer) {
          const candidate: DailyHighlight = {
            highlightType: "most_humiliating_win",
            publicId: match.publicId,
            playerId: humPlayer,
            value: Math.max(0, 20 - loserPr),
          };
          if (!mostHumiliating || candidate.value > mostHumiliating.value) mostHumiliating = candidate;
        }
      }
    }

    return highestMaxHit ?? mostCataclysms ?? mostHumiliating;
  }
}
