import { canonicalStringify } from "../codec/canonicalJson.ts";
import { sha256Hex } from "../crypto/hash.ts";
import { PCG32 } from "../rng/pcg32.ts";
import { RULESET_VERSION } from "../types.ts";
import type { ClassKey, MatchInput, Move } from "../types.ts";

export type EventV1 = {
  rulesetVersion: "1.0.0";
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

export type SummarySideV1 = {
  classKey: ClassKey;
  prFinal: number;
  pgFinal: number;
  totalDamage: number;
  maxHit: number;
  backfires: number;
  usedSkunkSafe: boolean;
};

export type SummaryV1 = {
  rulesetVersion: "1.0.0";
  winner: "A" | "B" | "DRAW";
  turns: number;
  a: SummarySideV1;
  b: SummarySideV1;
  highlights: {
    maxHitBy: "A" | "B" | "DRAW";
    maxHitValue: number;
    cataclysms: { A: number; B: number };
    clutchWin: boolean;
    humiliationWin: boolean;
  };
  matchHash: string;
};

type SideState = {
  classKey: ClassKey;
  pr: number;
  pg: number;
  defendActive: boolean;
  burnIncoming: number;
  burnFrom?: "A" | "B";
  skunkSafeUsed: boolean;
  totalDamage: number;
  maxHit: number;
  backfires: number;
  cataclysms: number;
};

type Actor = "A" | "B";

const MAX_MATCH_TURNS = 24;

const LATE_MATCH_DAMAGE_MULTIPLIER = Object.freeze({
  midgameStartTurn: 9,
  endgameStartTurn: 17,
  midgame: 1.2,
  endgame: 1.4,
});

function lateMatchDamageMultiplier(turn: number): number {
  if (turn >= LATE_MATCH_DAMAGE_MULTIPLIER.endgameStartTurn) return LATE_MATCH_DAMAGE_MULTIPLIER.endgame;
  if (turn >= LATE_MATCH_DAMAGE_MULTIPLIER.midgameStartTurn) return LATE_MATCH_DAMAGE_MULTIPLIER.midgame;
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushEvent(events: EventV1[], t: number, actor: EventV1["actor"], kind: string, state: { a: SideState; b: SideState }, extra: Partial<EventV1> = {}): void {
  const event: Record<string, unknown> = {
    rulesetVersion: RULESET_VERSION,
    t,
    actor,
    kind,
    prA: state.a.pr,
    prB: state.b.pr,
    pgA: state.a.pg,
    pgB: state.b.pg,
    ...extra,
  };

  for (const key of Object.keys(event)) {
    if (event[key] === undefined) {
      delete event[key];
    }
  }

  events.push(event as EventV1);
}

function defaultMove(pg: number): Move {
  if (pg >= 1) {
    return { type: "ATTACK", gas: 1 };
  }
  return { type: "RECHARGE_EXTRA" };
}

function sanitizeMove(raw: Move | undefined, side: SideState): Move {
  const move = raw ?? defaultMove(side.pg);

  if (move.type === "ATTACK") {
    let gas = clamp(move.gas, 1, 4);
    if (side.pg < gas) {
      gas = Math.min(4, side.pg);
    }
    if (gas === 0) {
      return { type: "RECHARGE_EXTRA" };
    }
    return { type: "ATTACK", gas: gas as 1 | 2 | 3 | 4, safe: move.safe === true };
  }

  if (move.type === "DEFEND") {
    if (side.pg < 2) {
      return { type: "RECHARGE_EXTRA" };
    }
    return move;
  }

  if (move.type === "HEAL") {
    if (side.classKey !== "fairy" || side.pg < 1) {
      return defaultMove(side.pg);
    }
    return move;
  }

  return move;
}

function rollOutcome(roll: number): "BACKFIRE" | "NORMAL" | "TOXIC" | "CATACLYSM" {
  if (roll <= 1999) return "BACKFIRE";
  if (roll <= 5999) return "NORMAL";
  if (roll <= 8999) return "TOXIC";
  return "CATACLYSM";
}

function applyDamage(state: { a: SideState; b: SideState }, target: Actor, amount: number, source: Actor, tags: string[]): { dmgToA: number; dmgToB: number; tags: string[] } {
  const defender = target === "A" ? state.a : state.b;
  const attacker = source === "A" ? state.a : state.b;
  const blocked = defender.defendActive ? 3 : 0;
  const finalDamage = Math.max(0, amount - blocked);

  if (finalDamage > 0) {
    defender.pr -= finalDamage;
    attacker.totalDamage += finalDamage;
    attacker.maxHit = Math.max(attacker.maxHit, finalDamage);

    if (defender.classKey === "troll") {
      const retaliate = 1;
      if (source === "A") {
        state.a.pr -= retaliate;
      } else {
        state.b.pr -= retaliate;
      }
      defender.totalDamage += retaliate;
      defender.maxHit = Math.max(defender.maxHit, retaliate);
      tags.push("TROLL_RETAL");
    }
  }

  return {
    dmgToA: target === "A" ? finalDamage : 0,
    dmgToB: target === "B" ? finalDamage : 0,
    tags,
  };
}

function resolveWinner(state: { a: SideState; b: SideState }): "A" | "B" | "DRAW" {
  if (state.a.pr <= 0 && state.b.pr <= 0) {
    return "DRAW";
  }
  if (state.a.pr <= 0) {
    return "B";
  }
  if (state.b.pr <= 0) {
    return "A";
  }

  if (state.a.pr !== state.b.pr) {
    return state.a.pr > state.b.pr ? "A" : "B";
  }

  if (state.a.totalDamage !== state.b.totalDamage) {
    return state.a.totalDamage > state.b.totalDamage ? "A" : "B";
  }

  if (state.a.maxHit !== state.b.maxHit) {
    return state.a.maxHit > state.b.maxHit ? "A" : "B";
  }

  return "DRAW";
}

export function simulateMatch(input: MatchInput, seedU64: bigint): { events: EventV1[]; summary: SummaryV1 } {
  const rng = new PCG32(seedU64);
  const events: EventV1[] = [];

  const state = {
    a: {
      classKey: input.creatureA.classKey,
      pr: 20,
      pg: 5,
      defendActive: false,
      burnIncoming: 0,
      skunkSafeUsed: false,
      totalDamage: 0,
      maxHit: 0,
      backfires: 0,
      cataclysms: 0,
    } as SideState,
    b: {
      classKey: input.creatureB.classKey,
      pr: 20,
      pg: 5,
      defendActive: false,
      burnIncoming: 0,
      skunkSafeUsed: false,
      totalDamage: 0,
      maxHit: 0,
      backfires: 0,
      cataclysms: 0,
    } as SideState,
  };

  let turn = 1;
  let turnsResolved = 0;
  let ended = false;

  const applyBurnTick = (target: Actor, t: number): void => {
    const side = target === "A" ? state.a : state.b;
    if (side.burnIncoming > 0) {
      const source = side.burnFrom;
      const dmg = side.burnIncoming;
      side.pr -= dmg;
      if (source === "A") {
        state.a.totalDamage += dmg;
        state.a.maxHit = Math.max(state.a.maxHit, dmg);
      } else if (source === "B") {
        state.b.totalDamage += dmg;
        state.b.maxHit = Math.max(state.b.maxHit, dmg);
      }
      side.burnIncoming = 0;
      side.burnFrom = undefined;
      pushEvent(events, t, "SYSTEM", "DOT", state, {
        dmgToA: target === "A" ? dmg : 0,
        dmgToB: target === "B" ? dmg : 0,
        tags: ["BURN_TICK"],
      });
    }
  };

  const recharge = (actor: Actor, t: number): void => {
    const side = actor === "A" ? state.a : state.b;
    const amount = side.classKey === "goblin" ? 3 : 2;
    side.pg = Math.min(8, side.pg + amount);
    pushEvent(events, t, actor, "RECHARGE", state, { gasSpent: -amount });
  };

  const resolveAction = (actor: Actor, t: number): void => {
    const side = actor === "A" ? state.a : state.b;
    const enemy = actor === "A" ? state.b : state.a;
    const rawMove = actor === "A" ? input.movesA[t - 1] : input.movesB[t - 1];
    const move = sanitizeMove(rawMove, side);

    if (move.type === "RECHARGE_EXTRA") {
      side.pg = Math.min(8, side.pg + 3);
      pushEvent(events, t, actor, "RECHARGE_EXTRA", state);
      return;
    }

    if (move.type === "DEFEND") {
      side.pg -= 2;
      side.defendActive = true;
      pushEvent(events, t, actor, "DEFEND", state, { gasSpent: 2 });
      return;
    }

    if (move.type === "HEAL") {
      side.pg -= 1;
      const before = side.pr;
      const healAmount = before < 5 ? 3 : 2;
      side.pr = Math.min(20, side.pr + healAmount);
      pushEvent(events, t, actor, "HEAL", state, {
        gasSpent: 1,
        tags: healAmount === 3 ? ["FAIRY_CLUTCH_HEAL"] : undefined,
      });
      return;
    }

    const gas = move.gas;
    side.pg -= gas;
    let roll = rng.nextRoll10000();
    let outcome = rollOutcome(roll);
    const tags: string[] = [];

    if (side.classKey === "skunk" && move.safe === true && !side.skunkSafeUsed) {
      side.skunkSafeUsed = true;
      tags.push("SKUNK_SAFE_USED");
      if (outcome === "BACKFIRE") {
        outcome = "NORMAL";
        tags.push("SKUNK_SAFE_PREVENTED_BACKFIRE");
      }
    }

    if (outcome === "BACKFIRE") {
      const selfDamage = Math.floor(gas / 2);
      side.backfires += 1;
      side.pr -= selfDamage;
      pushEvent(events, t, actor, "ATTACK", state, {
        roll,
        outcome,
        gasSpent: gas,
        dmgToA: actor === "A" ? selfDamage : 0,
        dmgToB: actor === "B" ? selfDamage : 0,
        tags,
      });
      return;
    }

    let damageAmount = gas;
    if (outcome === "TOXIC") {
      damageAmount = gas + 2;
    } else if (outcome === "CATACLYSM") {
      damageAmount = gas * 2 + 2;
      side.cataclysms += 1;
    }

    if (side.classKey === "dragon") {
      damageAmount += 1;
      tags.push("DRAGON_PLUS1");
      if (outcome === "CATACLYSM") {
        if (actor === "A") {
          state.b.burnIncoming = 1;
          state.b.burnFrom = "A";
        } else {
          state.a.burnIncoming = 1;
          state.a.burnFrom = "B";
        }
        tags.push("BURN_APPLIED");
      }
    }

    const scaledDamageAmount = Math.max(1, Math.round(damageAmount * lateMatchDamageMultiplier(t)));
    const damage = applyDamage(state, actor === "A" ? "B" : "A", scaledDamageAmount, actor, tags);
    pushEvent(events, t, actor, "ATTACK", state, {
      roll,
      outcome,
      gasSpent: gas,
      ...damage,
    });
  };

  // Fixed turn resolution order is authoritative for determinism:
  // A) burn ticks A then B, B) base recharge A then B, C) resolve A action,
  // D) if KO stop before B action, E) resolve B action, F) KO check.
  while (!ended && turn <= MAX_MATCH_TURNS) {
    turnsResolved = turn;
    state.a.defendActive = false;
    state.b.defendActive = false;
    pushEvent(events, turn, "SYSTEM", "TURN_START", state);

    applyBurnTick("A", turn);
    applyBurnTick("B", turn);

    if (state.a.pr <= 0 || state.b.pr <= 0) {
      ended = true;
      break;
    }

    recharge("A", turn);
    recharge("B", turn);

    resolveAction("A", turn);

    if (state.a.pr <= 0 || state.b.pr <= 0) {
      ended = true;
      break;
    }

    resolveAction("B", turn);

    if (state.a.pr <= 0 || state.b.pr <= 0) {
      ended = true;
      break;
    }

    turn += 1;
  }

  const turns = turnsResolved;

  let winner: "A" | "B" | "DRAW" = resolveWinner(state);

  if (winner !== "DRAW" && (state.a.pr <= 0 || state.b.pr <= 0)) {
    const loser: Actor = winner === "A" ? "B" : "A";
    const vengeanceTags: string[] = ["VENGEANCE_FART"];
    let roll = rng.nextRoll10000();
    let outcome = rollOutcome(roll);
    if (outcome === "BACKFIRE") {
      outcome = "NORMAL";
      vengeanceTags.push("VENGEANCE_NO_BACKFIRE");
    }

    const attacker = loser === "A" ? state.a : state.b;
    let dmg = outcome === "CATACLYSM" ? 8 : outcome === "TOXIC" ? 5 : 3;
    if (attacker.classKey === "dragon") {
      dmg += 1;
      vengeanceTags.push("DRAGON_PLUS1");
      if (outcome === "CATACLYSM") {
        if (loser === "A") {
          state.b.burnIncoming = 1;
          state.b.burnFrom = "A";
        } else {
          state.a.burnIncoming = 1;
          state.a.burnFrom = "B";
        }
        vengeanceTags.push("BURN_APPLIED");
      }
    }

    const dealt = applyDamage(state, loser === "A" ? "B" : "A", dmg, loser, vengeanceTags);
    pushEvent(events, turns, loser, "VENGEANCE", state, {
      roll,
      outcome,
      gasSpent: 0,
      ...dealt,
    });

    winner = resolveWinner(state);
  }

  const summaryWithoutHash: Omit<SummaryV1, "matchHash"> = {
    rulesetVersion: RULESET_VERSION,
    winner,
    turns,
    a: {
      classKey: state.a.classKey,
      prFinal: state.a.pr,
      pgFinal: state.a.pg,
      totalDamage: state.a.totalDamage,
      maxHit: state.a.maxHit,
      backfires: state.a.backfires,
      usedSkunkSafe: state.a.skunkSafeUsed,
    },
    b: {
      classKey: state.b.classKey,
      prFinal: state.b.pr,
      pgFinal: state.b.pg,
      totalDamage: state.b.totalDamage,
      maxHit: state.b.maxHit,
      backfires: state.b.backfires,
      usedSkunkSafe: state.b.skunkSafeUsed,
    },
    highlights: {
      maxHitBy: state.a.maxHit === state.b.maxHit ? "DRAW" : state.a.maxHit > state.b.maxHit ? "A" : "B",
      maxHitValue: Math.max(state.a.maxHit, state.b.maxHit),
      cataclysms: { A: state.a.cataclysms, B: state.b.cataclysms },
      clutchWin: winner !== "DRAW" && ((winner === "A" ? state.a.pr : state.b.pr) <= 3),
      humiliationWin: winner !== "DRAW" && (winner === "A" ? state.b.pr : state.a.pr) <= -10,
    },
  };

  const summary: SummaryV1 = {
    ...summaryWithoutHash,
    matchHash: deriveMatchHash(input, events, summaryWithoutHash),
  };

  return { events, summary };
}

export function deriveMatchHash(
  input: MatchInput,
  events: EventV1[],
  summaryWithoutHash: Omit<SummaryV1, "matchHash">,
): string {
  return sha256Hex(
    canonicalStringify({
      rulesetVersion: RULESET_VERSION,
      input,
      events,
      summary: summaryWithoutHash,
    }),
  );
}
