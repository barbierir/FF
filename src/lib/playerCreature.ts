import type { CreatureId } from "./creatures.ts";

function keyFor(playerId: string): string {
  return `ff:player:${playerId}:creatureId`;
}

export function getPlayerCreatureId(playerId: string): CreatureId | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(keyFor(playerId));
  if (!value) return null;
  if (value === "goblin" || value === "dragon" || value === "skunk" || value === "troll" || value === "fairy") {
    return value;
  }
  return null;
}

export function setPlayerCreatureId(playerId: string, creatureId: CreatureId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(playerId), creatureId);
}

export function clearPlayerCreatureId(playerId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyFor(playerId));
}
