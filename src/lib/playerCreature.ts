import type { CreatureId } from "./creatures.ts";

const PREFIX = "ff:player:";
const CREATURE_SUFFIX = ":creatureId";
const NICKNAME_SUFFIX = ":creatureNickname";
const PENDING_CREATURE_KEY = "ff:pendingCreatureId";
const PENDING_NICKNAME_KEY = "ff:pendingCreatureNickname";

function keyForCreature(playerId: string): string {
  return `${PREFIX}${playerId}${CREATURE_SUFFIX}`;
}

function keyForNickname(playerId: string): string {
  return `${PREFIX}${playerId}${NICKNAME_SUFFIX}`;
}

export function getPlayerCreatureId(playerId: string): CreatureId | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(keyForCreature(playerId));
  if (value === "goblin" || value === "dragon" || value === "skunk" || value === "troll" || value === "fairy" || value === "demon") {
    return value;
  }
  return null;
}

export function setPlayerCreatureId(playerId: string, creatureId: CreatureId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyForCreature(playerId), creatureId);
}

export function clearPlayerCreatureId(playerId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyForCreature(playerId));
}

export function getPlayerCreatureNickname(playerId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(keyForNickname(playerId));
}

export function setPlayerCreatureNickname(playerId: string, nickname: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyForNickname(playerId), nickname);
}

export function clearPlayerCreatureNickname(playerId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyForNickname(playerId));
}

export function getPendingCreatureSelection(): { creatureId: CreatureId; nickname: string } | null {
  if (typeof window === "undefined") return null;
  const creatureId = window.localStorage.getItem(PENDING_CREATURE_KEY);
  const nickname = window.localStorage.getItem(PENDING_NICKNAME_KEY);
  if (!creatureId || !nickname) return null;
  if (creatureId !== "goblin" && creatureId !== "dragon" && creatureId !== "skunk" && creatureId !== "troll" && creatureId !== "fairy" && creatureId !== "demon") return null;
  return { creatureId, nickname };
}

export function setPendingCreatureSelection(selection: { creatureId: CreatureId; nickname: string }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_CREATURE_KEY, selection.creatureId);
  window.localStorage.setItem(PENDING_NICKNAME_KEY, selection.nickname);
}

export function clearPendingCreatureSelection(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_CREATURE_KEY);
  window.localStorage.removeItem(PENDING_NICKNAME_KEY);
}
