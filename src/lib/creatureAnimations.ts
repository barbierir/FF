import type { CreatureId } from "./creatures.ts";

export type PresentationActionType =
  | "prepare"
  | "charge"
  | "attack_normal"
  | "attack_cataclysm"
  | "attack_backfire"
  | "attack_toxic"
  | "hit"
  | "defend"
  | "critical_hit"
  | "stunned"
  | "revenge"
  | "defeat"
  | "victory";

export type CreatureAnimationMap = Record<PresentationActionType, string>;
export type ActionSoundMap = Record<PresentationActionType, string>;

export type PresentationEvent = {
  kind?: string;
  outcome?: string;
  tags?: string[];
};

const PRESENTATION_ACTIONS: PresentationActionType[] = [
  "prepare",
  "charge",
  "attack_normal",
  "attack_cataclysm",
  "attack_backfire",
  "attack_toxic",
  "hit",
  "defend",
  "critical_hit",
  "stunned",
  "revenge",
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
  goblin: "/creatures/idle/goblin.gif",
  dragon: "/creatures/idle/dragon.gif",
  skunk: "/creatures/idle/slime.gif",
  troll: "/creatures/idle/skeleton.gif",
  fairy: "/creatures/idle/wizard.gif",
  demon: "/creatures/idle/demon.gif",
};

export const ACTION_SOUNDS: ActionSoundMap = {
  prepare: "/audio/actions/prepare.mp3",
  charge: "/audio/actions/charge.mp3",
  attack_normal: "/audio/actions/attack_normal.mp3",
  attack_cataclysm: "/audio/actions/attack_cataclysm.mp3",
  attack_backfire: "/audio/actions/attack_backfire.mp3",
  attack_toxic: "/audio/actions/attack_toxic.mp3",
  hit: "/audio/actions/hit.mp3",
  defend: "/audio/actions/defend.mp3",
  critical_hit: "/audio/actions/critical_hit.mp3",
  stunned: "/audio/actions/stunned.mp3",
  revenge: "/audio/actions/revenge.mp3",
  defeat: "/audio/actions/defeat.mp3",
  victory: "/audio/actions/victory.mp3",
};

export function mapEventToPresentationAction(event: PresentationEvent | null | undefined): PresentationActionType {
  if (!event) return "prepare";
  if (event.kind === "ATTACK" && event.outcome === "CATACLYSM") return "attack_cataclysm";
  if (event.kind === "ATTACK" && event.outcome === "BACKFIRE") return "attack_backfire";
  if (event.kind === "ATTACK" && event.outcome === "TOXIC") return "attack_toxic";
  if (event.kind === "ATTACK" && (event.tags || []).includes("CRITICAL_HIT")) return "critical_hit";
  if (event.kind === "ATTACK") return "attack_normal";
  if (event.kind === "DOT") return "hit";
  if (event.kind === "DEFEND") return "defend";
  if (event.kind === "VENGEANCE") return "revenge";
  if (event.kind === "RECHARGE_EXTRA" || event.kind === "RECHARGE") return "charge";
  if (event.kind === "STUNNED" || (event.tags || []).includes("STUNNED")) return "stunned";
  return "prepare";
}

export function getCreatureAnimationPath(creatureId: CreatureId, actionType: PresentationActionType): string {
  return CREATURE_ANIMATIONS[creatureId][actionType];
}

export function getActionSoundPath(actionType: PresentationActionType): string {
  return ACTION_SOUNDS[actionType];
}
