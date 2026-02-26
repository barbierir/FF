export const RULESET_VERSION = "1.0.0" as const;

export type RulesetVersion = typeof RULESET_VERSION;

export type ClassKey = "goblin" | "dragon" | "skunk" | "troll" | "fairy";

export type Move =
  | { rulesetVersion: RulesetVersion; type: "ATTACK"; gas: 1 | 2 | 3 | 4; safe?: boolean }
  | { rulesetVersion: RulesetVersion; type: "DEFEND" }
  | { rulesetVersion: RulesetVersion; type: "RECHARGE_EXTRA" }
  | { rulesetVersion: RulesetVersion; type: "HEAL" };

export type CreatureSpec = {
  rulesetVersion: RulesetVersion;
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
