import type { ClassKey, CreatureSpec, Move } from "../core/types.ts";
import type { MatchMode } from "./storage/types.ts";
import { HttpError } from "./errors.ts";

const CLASS_KEYS: ClassKey[] = ["goblin", "dragon", "skunk", "troll", "fairy", "demon"];
const ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_TURNS = 30;

function asObject(value: unknown, code: string, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, code, message);
  }
  return value as Record<string, unknown>;
}

function asInteger(value: unknown, code: string, message: string): number {
  if (!Number.isInteger(value)) {
    throw new HttpError(400, code, message);
  }
  return value as number;
}

export function validateCreatureSpec(value: unknown): CreatureSpec {
  const obj = asObject(value, "invalid_creature", "Creature must be an object");
  if (!CLASS_KEYS.includes(obj.classKey as ClassKey)) {
    throw new HttpError(400, "invalid_class_key", "Creature classKey is invalid");
  }

  const cosmeticSeed = asInteger(obj.cosmeticSeed, "invalid_cosmetic_seed", "cosmeticSeed must be an integer");
  if (cosmeticSeed < 0 || cosmeticSeed > 2 ** 31 - 1) {
    throw new HttpError(400, "invalid_cosmetic_seed", "cosmeticSeed must be between 0 and 2147483647");
  }

  return { classKey: obj.classKey as ClassKey, cosmeticSeed };
}

export function validateMoves(classKey: ClassKey, value: unknown): Move[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "invalid_moves", "moves must be an array");
  }
  if (value.length > MAX_TURNS) {
    throw new HttpError(400, "invalid_moves", `moves length cannot exceed ${MAX_TURNS}`);
  }

  return value.map((raw, index) => {
    const obj = asObject(raw, "invalid_move", `move at index ${index} must be an object`);
    const moveType = obj.type;

    if (moveType === "ATTACK") {
      const gas = asInteger(obj.gas, "invalid_gas", `move at index ${index} has invalid gas`);
      if (gas < 1 || gas > 4) {
        throw new HttpError(400, "invalid_gas", `move at index ${index} gas must be 1..4`);
      }
      const out: Move = { type: "ATTACK", gas: gas as 1 | 2 | 3 | 4 };
      if (obj.safe === true && classKey === "skunk") {
        out.safe = true;
      }
      return out;
    }

    if (moveType === "DEFEND" || moveType === "RECHARGE_EXTRA" || moveType === "HEAL") {
      return { type: moveType } as Move;
    }

    throw new HttpError(400, "invalid_move_type", `move at index ${index} has unknown type`);
  });
}

export function validateId(kind: "playerId" | "token" | "publicId" | "matchId", value: unknown, minLength = 6): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `invalid_${kind}`, `${kind} must be a string`);
  }
  if (value.length < minLength || !ID_RE.test(value)) {
    throw new HttpError(400, `invalid_${kind}`, `${kind} format is invalid`);
  }
  return value;
}

export function maybeValidatePlayerId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return validateId("playerId", value, 3);
}

export function validateExpiresInHours(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const hours = asInteger(value, "invalid_expires_in_hours", "expiresInHours must be an integer");
  if (hours < 1 || hours > 168) {
    throw new HttpError(400, "invalid_expires_in_hours", "expiresInHours must be between 1 and 168");
  }
  return hours;
}

export function validateMatchMode(value: unknown): MatchMode | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "manual" || value === "auto") return value;
  throw new HttpError(400, "invalid_mode", "mode must be 'manual' or 'auto'");
}

export function validateSingleAction(classKey: ClassKey, value: unknown): Move {
  const moves = validateMoves(classKey, [value]);
  return moves[0];
}
