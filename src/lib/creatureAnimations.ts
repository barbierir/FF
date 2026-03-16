import type { CreatureId } from "./creatures.ts";

export type PresentationActionType =
  | "idle"
  | "charge"
  | "attack"
  | "backfire"
  | "hit"
  | "defeat"
  | "victory";

export type CreatureAnimationMap = Record<PresentationActionType, string>;
export type ActionSoundMap = Partial<Record<PresentationActionType, string>>;

export type PresentationEvent = {
  kind?: string;
  outcome?: string;
  tags?: string[];
};

const PRESENTATION_ACTIONS: PresentationActionType[] = [
  "idle",
  "charge",
  "attack",
  "backfire",
  "hit",
  "defeat",
  "victory",
];

function buildCreatureAnimationMap(creatureId: CreatureId): CreatureAnimationMap {
  const entries = PRESENTATION_ACTIONS.map((actionType) => [actionType, `/animations/${creatureId}/${actionType}.gif`] as const);
  return Object.fromEntries(entries) as CreatureAnimationMap;
}

export const CREATURE_ANIMATIONS: Record<CreatureId, CreatureAnimationMap> = {
  goblin: buildCreatureAnimationMap("goblin"),
  dragon: buildCreatureAnimationMap("dragon"),
  skunk: buildCreatureAnimationMap("skunk"),
  troll: buildCreatureAnimationMap("troll"),
  fairy: buildCreatureAnimationMap("fairy"),
  demon: buildCreatureAnimationMap("demon"),
};

export const CREATURE_IDLE_ANIMATIONS: Record<CreatureId, string> = {
  goblin: "/creatures/goblin/idle.gif",
  dragon: "/creatures/dragon/idle.gif",
  skunk: "/creatures/skunk/idle.gif",
  troll: "/creatures/troll/idle.gif",
  fairy: "/creatures/fairy/idle.gif",
  demon: "/creatures/demon/idle.gif",
};

export const ACTION_SOUNDS: ActionSoundMap = {
  charge: "charge",
  attack: "attack_normal",
  hit: "hit",
  backfire: "backfire",
  victory: "victory",
};

export function mapEventToPresentationAction(event: PresentationEvent | null | undefined): PresentationActionType {
  if (!event) return "charge";
  if (event.kind === "ATTACK" && event.outcome === "BACKFIRE") return "backfire";
  if (event.kind === "ATTACK") return "attack";
  if (event.kind === "DOT") return "hit";
  if (event.kind === "RECHARGE_EXTRA" || event.kind === "RECHARGE") return "charge";
  return "charge";
}

export function getCreatureAnimationPath(creatureId: CreatureId, actionType: PresentationActionType): string {
  return CREATURE_ANIMATIONS[creatureId][actionType];
}

export function getActionSoundPath(actionType: PresentationActionType): string {
  return ACTION_SOUNDS[actionType] ?? "";
}
