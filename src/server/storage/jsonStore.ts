import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "../../core/codec/canonicalJson.ts";
import { sha256Hex } from "../../core/crypto/hash.ts";
import { deriveSeedU64 } from "../../core/sim/deriveSeed.ts";
import { deriveMatchHash, simulateMatch } from "../../core/sim/simulate.ts";
import { RULESET_VERSION } from "../../core/types.ts";
import type { CreatureSpec, MatchInput, Move } from "../../core/types.ts";
import type { Store } from "./store.ts";
import type {
  CreateChallengeInput,
  FinalizedPayload,
  ReplayPayload,
  Side,
  StoredChallenge,
  StoredMatch,
  StoredMoves,
} from "./types.ts";

type DbState = {
  challenges: StoredChallenge[];
  matches: StoredMatch[];
  moves: StoredMoves[];
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

function assertMoveShape(move: Move, index: number): void {
  if (move.rulesetVersion !== RULESET_VERSION) {
    throw new Error(`Invalid rulesetVersion at moves[${index}]`);
  }

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

  private readonly serverSecret: string;

  private state: DbState = { challenges: [], matches: [], moves: [] };

  private ready: Promise<void>;

  constructor(baseDir = path.resolve(process.cwd(), "data", "faf"), serverSecret?: string) {
    this.baseDir = baseDir;
    this.challengesPath = path.join(baseDir, "challenges.json");
    this.matchesPath = path.join(baseDir, "matches.json");
    this.movesPath = path.join(baseDir, "moves.json");
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
    };
  }

  async createChallenge(input: CreateChallengeInput): Promise<StoredChallenge> {
    await this.ready;
    const createdAtISO = nowIso();
    const expiresInHours = input.expiresInHours ?? 24;
    const expiresAtISO = new Date(Date.parse(createdAtISO) + expiresInHours * 3600 * 1000).toISOString();
    const challenge: StoredChallenge = {
      id: randomId("chal"),
      token: randomToken(18),
      status: "open",
      ruleset_version: RULESET_VERSION,
      creatureA: input.creatureA,
      createdAtISO,
      expiresAtISO,
    };

    this.state.challenges.push(challenge);
    await this.flush();
    return challenge;
  }

  async getChallengeByToken(token: string): Promise<StoredChallenge | undefined> {
    await this.ready;
    return this.state.challenges.find((challenge) => challenge.token === token);
  }

  async acceptChallenge(token: string, creatureB: CreatureSpec): Promise<StoredMatch> {
    await this.ready;
    const challenge = this.state.challenges.find((item) => item.token === token);
    if (!challenge) {
      throw new Error("Challenge not found");
    }

    if (new Date(challenge.expiresAtISO).getTime() <= Date.now()) {
      challenge.status = "expired";
      await this.flush();
      throw new Error("Challenge expired");
    }

    if (challenge.status !== "open") {
      throw new Error("Challenge is not open");
    }

    challenge.status = "accepted";
    challenge.creatureB = creatureB;

    const match: StoredMatch = {
      id: randomId("match"),
      challengeId: challenge.id,
      publicId: randomToken(18),
      status: "collecting_moves",
      createdAtISO: nowIso(),
    };

    challenge.matchId = match.id;
    this.state.matches.push(match);
    await this.flush();
    return match;
  }

  async submitMoves(matchId: string, side: Side, moves: Move[]): Promise<StoredMoves> {
    await this.ready;
    validateMoves(moves);
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }

    if (match.status === "finished") {
      throw new Error("Match already finished");
    }

    const existing = this.state.moves.find((item) => item.matchId === matchId && item.side === side);
    if (existing) {
      throw new Error(`Moves already submitted for side ${side}`);
    }

    const record: StoredMoves = {
      id: randomId("mv"),
      matchId,
      side,
      moves_received_json: JSON.stringify(moves),
      moves_json: canonicalStringify(moves),
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

    await this.flush();
    return match;
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
}
