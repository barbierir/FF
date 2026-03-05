export const RULESET_VERSION = "1.0.0" as const;

export type RulesetVersion = typeof RULESET_VERSION;

export type ClassKey = "goblin" | "dragon" | "skunk" | "troll" | "fairy" | "demon";

export type Move =
  | { type: "ATTACK"; gas: 1 | 2 | 3 | 4; safe?: boolean }
  | { type: "DEFEND" }
  | { type: "RECHARGE_EXTRA" }
  | { type: "HEAL" };

export type CreatureSpec = {
  classKey: ClassKey;
  cosmeticSeed: number;
};

export type MatchInput = {
  rulesetVersion: RulesetVersion;
  challengeId: string;
  creatureA: CreatureSpec;
  creatureB: CreatureSpec;
  movesA: Move[];
  movesB: Move[];
  createdAtISO: string;
};

export type Event = {
  rulesetVersion: RulesetVersion;
  t: number;
  actor: "A" | "B" | "SYSTEM";
  kind: string;
  roll?: number;
  outcome?: "BACKFIRE" | "NORMAL" | "TOXIC" | "CATACLYSM";
  gasSpent?: number;
  dmgToA?: number;
  dmgToB?: number;
  prA: number;
  prB: number;
  pgA: number;
  pgB: number;
  tags?: string[];
};

export type Summary = {
  rulesetVersion: RulesetVersion;
  winner: "A" | "B" | "DRAW";
  turns: number;
  matchHash: string;
};
